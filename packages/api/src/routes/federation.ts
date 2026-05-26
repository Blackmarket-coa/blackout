import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';

const federation = new Hono();

const homeserverDomain = () =>
  (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');

const createLinkSchema = z.object({
  sourceCommunityId: z.string().min(1),
  targetCommunityId: z.string().min(1),
  linkType: z.enum(['zone', 'alliance', 'supply_chain']).optional(),
  matrixBridgeRoomId: z.string().optional(),
});

federation.post('/links', async (c) => {
  const parsed = await readJsonBody(c, createLinkSchema);
  if (parsed instanceof Response) return parsed;
  const { sourceCommunityId, targetCommunityId, linkType = 'zone', matrixBridgeRoomId } = parsed;

  const link = db.createFederationLink({
    id: crypto.randomUUID(),
    sourceCommunityId,
    targetCommunityId,
    linkType,
    matrixBridgeRoomId: matrixBridgeRoomId ?? `!bridge-${sourceCommunityId}-${targetCommunityId}:${homeserverDomain()}`,
    isActive: true,
  });

  return c.json(link, 201);
});

federation.get('/communities', (c) => {
  const ids = c.req.query('ids')?.split(',').filter(Boolean) ?? [];
  return c.json({ communities: db.getFederatedCommunities(ids) });
});

export default federation;
