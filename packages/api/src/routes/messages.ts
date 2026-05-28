/**
 * WHAT THIS FILE DOES
 * Handles sending and reading messages in channels (the core messaging API).
 *
 * WHAT WAS WRONG (TWO CRITICAL VULNERABILITIES)
 * 1. No authentication: anyone could read any channel's messages by calling
 *    GET /:channelId without logging in.
 * 2. Identity forgery on POST: the `userId` field was accepted from the
 *    untrusted request body. An attacker could impersonate any user just
 *    by setting `{ "userId": "victim-id" }` in their request body.
 *
 * HOW IT WAS FIXED
 * 1. GET requires `requireUser(c)` — only authenticated users can read messages.
 * 2. POST now reads `authUser.sub` from the JWT (verified by the middleware)
 *    instead of `parsed.userId` from the body (which anyone can forge).
 * 3. Steganography key (`STEGO_KEY`) no longer defaults to 'local-stego-key' —
 *    if not configured, stego tier 3 returns 503 instead of using a known key.
 * 4. `messageRateLimit` (60 req/min) added to prevent channel flooding.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { encodeStego, encryptE2E, formatFederatedMessage, signMessage } from '@blackout/core';
import { db } from '../db/store';
import type { VoteRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';
import { routeOutboundMatrixMessage } from '../services/outboundMessageRouter';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { messageRateLimit } from '../middleware/rate-limit';
import { log } from '../telemetry/logger';

const messages = new Hono();
messages.use('*', messageRateLimit);

const sendMessageSchema = z.object({
  content: z.string().min(1),
  stegoTier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  sign: z.boolean().optional(),
  matrixRoomId: z.string().optional(),
  governance: z.object({
    type: z.enum(['poll', 'proposal', 'election']),
    data: z.unknown().optional(),
  }).optional(),
});

messages.get('/:channelId', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const { channelId } = c.req.param();
  const { limit = '50', before } = c.req.query();
  const parsedLimit = Number.parseInt(limit, 10);

  return c.json(db.getMessages(channelId, Number.isNaN(parsedLimit) ? 50 : parsedLimit, before));
});

messages.post('/:channelId', async (c) => {
  const authUser = requireUser(c);
  if (authUser instanceof Response) return authUser;
  const { channelId } = c.req.param();
  const parsed = await readJsonBody(c, sendMessageSchema);
  if (parsed instanceof Response) return parsed;
  const { content, stegoTier = 1, sign = false, matrixRoomId, governance } = parsed;
  const userId = authUser.sub;

  const user = db.getUserById(userId);
  if (!user) {
    return c.json({ code: 'user_not_found', message: 'Unknown user' }, 404);
  }

  let transformedContent = content;
  let encryptionAlgorithm: string | undefined;

  if (stegoTier === 3) {
    const stegoKey = process.env.STEGO_KEY;
    if (!stegoKey) {
      return c.json({ code: 'stego_unavailable', message: 'Steganography is not configured' }, 503);
    }
    transformedContent = encodeStego(content, stegoKey);
    encryptionAlgorithm = 'steganography';
  } else if (stegoTier === 2) {
    transformedContent = encryptE2E(content, user.pubkeyEd25519);
    encryptionAlgorithm = 'e2e';
  }

  const message = db.createMessage({
    id: crypto.randomUUID(),
    channelId,
    userId,
    content: transformedContent,
    governance:
      governance?.type === 'poll' ? (governance as { type: 'poll'; data: VoteRecord }) : undefined,
    contentStegoTier: stegoTier,
    signature: sign ? signMessage(content, userId) : undefined,
    isEncrypted: stegoTier > 1,
    encryptionAlgorithm,
  });

  const federatedPreview = formatFederatedMessage(user.username, content);
  const matrix = matrixRoomId ? await matrixClient.sendMessage(matrixRoomId, federatedPreview) : null;

  // After landing the message in the Blackout-side Matrix room, fan it
  // out to any source platforms bridged to that room (Twitch chat bridge
  // → Twitch IRC; YouTube chat bridge → liveChatMessages.insert). Only
  // the plain `m.text` body — encrypted / steganographic content stays
  // Blackout-internal because it isn't meaningful to a Twitch viewer.
  // Loop prevention: this dispatch path never carries `m.blackout.origin`,
  // so the chat-bridge ingress side doesn't see its own echo.
  let outboundFanout: Awaited<ReturnType<typeof routeOutboundMatrixMessage>> | null = null;
  if (matrixRoomId && stegoTier === 1) {
    try {
      outboundFanout = await routeOutboundMatrixMessage(matrixRoomId, content);
    } catch (err) {
      log.warn('messages_outbound_router_threw', {
        matrixRoomId,
        error: String(err),
      });
    }
  }

  return c.json({ message, matrix, outboundFanout }, 201);
});

export default messages;
