import { Hono } from 'hono';
import { encodeStego, encryptE2E, formatFederatedMessage, signMessage } from '@blackout/core';

const messages = new Hono();

messages.get('/:channelId', (c) => {
  const { channelId } = c.req.param();
  return c.json({ channelId, messages: [] });
});

messages.post('/:channelId', async (c) => {
  const { channelId } = c.req.param();
  const { content, stegoTier = 1, sign = false, userId = 'stub-user' } = await c.req.json();

  let transformedContent = content;
  if (stegoTier === 3) transformedContent = encodeStego(content, 'stego-key');
  if (stegoTier === 2) transformedContent = encryptE2E(content, 'recipient-public-key');

  return c.json({
    id: crypto.randomUUID(),
    channelId,
    content: transformedContent,
    signature: sign ? signMessage(content, userId) : null,
    federatedPreview: formatFederatedMessage(userId, content),
  }, 201);
});

export default messages;
