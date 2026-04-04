import { Hono } from 'hono';
import { encodeStego, encryptE2E, formatFederatedMessage, signMessage } from '@blackout/core';
import { db } from '../db/store';
import { matrixClient } from '../integrations/matrix-client';

const messages = new Hono();

messages.get('/:channelId', (c) => {
  const { channelId } = c.req.param();
  const { limit = '50', before } = c.req.query();
  const parsedLimit = Number.parseInt(limit, 10);

  return c.json(db.getMessages(channelId, Number.isNaN(parsedLimit) ? 50 : parsedLimit, before));
});

messages.post('/:channelId', async (c) => {
  const { channelId } = c.req.param();
  const {
    content,
    stegoTier = 1,
    sign = false,
    userId,
    matrixRoomId,
    governance,
  } = await c.req.json();

  if (!content || !userId) {
    return c.json({ error: 'content and userId are required' }, 400);
  }

  const user = db.getUserById(userId);
  if (!user) {
    return c.json({ error: 'Unknown user' }, 404);
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
