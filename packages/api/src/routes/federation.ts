import { Hono } from 'hono';
import { db } from '../db/store';

const federation = new Hono();

federation.post('/links', async (c) => {
  const { sourceCommunityId, targetCommunityId, linkType = 'zone', matrixBridgeRoomId } = await c.req.json();

  if (!sourceCommunityId || !targetCommunityId) {
    return c.json({ error: 'sourceCommunityId and targetCommunityId are required' }, 400);
  }

  const link = db.createFederationLink({
    id: crypto.randomUUID(),
    sourceCommunityId,
    targetCommunityId,
    linkType,
    matrixBridgeRoomId: matrixBridgeRoomId ?? `!bridge-${sourceCommunityId}-${targetCommunityId}:blackout.local`,
    isActive: true,
  });

  return c.json(link, 201);
});

federation.get('/communities', (c) => {
  const ids = c.req.query('ids')?.split(',').filter(Boolean) ?? [];
  return c.json({ communities: db.getFederatedCommunities(ids) });
});
  const payload = await c.req.json();
  return c.json({
    linkId: crypto.randomUUID(),
    bridgeRoomId: `!bridge-${payload.sourceCommunityId}-${payload.targetCommunityId}:matrix.example.com`,
  }, 201);
});

federation.get('/communities', (c) => c.json([]));

export default federation;
