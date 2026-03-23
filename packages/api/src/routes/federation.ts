import { Hono } from 'hono';

const federation = new Hono();

federation.post('/links', async (c) => {
  const payload = await c.req.json();
  return c.json({
    linkId: crypto.randomUUID(),
    bridgeRoomId: `!bridge-${payload.sourceCommunityId}-${payload.targetCommunityId}:matrix.example.com`,
  }, 201);
});

federation.get('/communities', (c) => c.json([]));

export default federation;
