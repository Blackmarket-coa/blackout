import { Hono } from 'hono';
import { z } from 'zod';
import { encodeStego, encryptE2E, formatFederatedMessage, signMessage } from '@blackout/core';
import { db } from '../db/store';
import { matrixClient } from '../integrations/matrix-client';
import { readJsonBody } from '../middleware/validate';

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

  return c.json({ message, matrix }, 201);
});

export default messages;
