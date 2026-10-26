import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import { canopyAdminRefusalResponse, checkCanopyAdmin } from '../services/canopyListingGate';
import { homeserverDomain } from '../services/userIdentity';

const federation = new Hono();

const createLinkSchema = z.object({
    sourceCommunityId: z.string().min(1),
    targetCommunityId: z.string().min(1),
    linkType: z.enum(['zone', 'alliance', 'supply_chain']).optional(),
    matrixBridgeRoomId: z.string().optional(),
});

const NOT_ADMIN_OF_BOTH = 'Linking two communities takes being an admin of both.';

/**
 * A link names two communities as linked (a zone, an alliance, a supply
 * chain), and `GET /communities` tells anyone which of a set of ids are
 * linked: it is a public statement about both, so it needs the consent of
 * both. The only consent the API can check is standing on the homeserver, so
 * the caller must be an admin of each community as a canopy (a Matrix space),
 * the standing listing a canopy takes (`services/canopyListingGate.ts`),
 * source first. A community id that is not a canopy the caller administers is
 * refused, and so is every link while the homeserver cannot answer.
 *
 * Two communities with different admins cannot be linked yet: that takes one
 * side proposing and the other accepting, which does not exist, and whether
 * a link should work that way is a product decision (F6 in
 * docs/security/api-findings-triage-2026-10-25.md). Until 2026-10-26 this
 * route took no session and linked any two ids for anyone.
 */
federation.post('/links', async (c) => {
    const user = requireUser(c, 'Sign in to link communities');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createLinkSchema);
    if (parsed instanceof Response) return parsed;
    const { sourceCommunityId, targetCommunityId, linkType = 'zone', matrixBridgeRoomId } = parsed;

    for (const [side, canopyId] of [
        ['source', sourceCommunityId],
        ['target', targetCommunityId],
    ] as const) {
        const verdict = await checkCanopyAdmin(user.sub, canopyId);
        if (!verdict.ok) {
            const { status, body } = canopyAdminRefusalResponse(verdict.reason, NOT_ADMIN_OF_BOTH);
            return c.json({ ...body, side }, status);
        }
    }

    const link = db.createFederationLink({
        id: crypto.randomUUID(),
        sourceCommunityId,
        targetCommunityId,
        linkType,
        matrixBridgeRoomId:
            matrixBridgeRoomId ??
            `!bridge-${sourceCommunityId}-${targetCommunityId}:${homeserverDomain()}`,
        isActive: true,
    });

    return c.json(link, 201);
});

federation.get('/communities', (c) => {
    const ids = c.req.query('ids')?.split(',').filter(Boolean) ?? [];
    return c.json({ communities: db.getFederatedCommunities(ids) });
});

export default federation;
