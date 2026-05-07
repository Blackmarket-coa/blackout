import { Hono } from 'hono';
import { z } from 'zod';
import { encodeStego, encryptE2E, formatFederatedMessage, signMessage } from '@blackout/core';
import { db } from '../db/store';
import { matrixClient } from '../integrations/matrix-client';
import { routeOutboundMatrixMessage } from '../services/outboundMessageRouter';
import { readJsonBody } from '../middleware/validate';
import { log } from '../telemetry/logger';

const messages = new Hono();

const sendMessageSchema = z.object({
  content: z.string().min(1),
  userId: z.string().min(1),
  stegoTier: z.number().int().min(1).max(3).optional(),
  sign: z.boolean().optional(),
  matrixRoomId: z.string().optional(),
  governance: z.looseObject({ type: z.string() }).optional(),
});

messages.get('/:channelId', (c) => {
  const { channelId } = c.req.param();
  const { limit = '50', before } = c.req.query();
  const parsedLimit = Number.parseInt(limit, 10);

  return c.json(db.getMessages(channelId, Number.isNaN(parsedLimit) ? 50 : parsedLimit, before));
});

messages.post('/:channelId', async (c) => {
  const { channelId } = c.req.param();
  const parsed = await readJsonBody(c, sendMessageSchema);
  if (parsed instanceof Response) return parsed;
  const { content, stegoTier = 1, sign = false, userId, matrixRoomId, governance } = parsed;

  const user = db.getUserById(userId);
  if (!user) {
    return c.json({ code: 'user_not_found', message: 'Unknown user' }, 404);
  }

  let transformedContent = content;
  let encryptionAlgorithm: string | undefined;

  if (stegoTier === 3) {
    transformedContent = encodeStego(content, process.env.STEGO_KEY ?? 'local-stego-key');
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
    governance: governance?.type === 'poll' ? governance : undefined,
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
