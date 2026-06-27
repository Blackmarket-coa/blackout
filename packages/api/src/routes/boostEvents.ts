// In-room Boost (Hype Train) endpoints (FBM → Blackout, service-to-service).
//
//   POST /v1/boost-events/update   — create/advance a co.bmc.boost state event
//   GET  /v1/boost-events/:roomId   — list boosts in a room
//
// Auth: internal shared secret in `X-BMC-Internal-Secret`, compared in constant
// time against `BLACKOUT_INTERNAL_SECRET`. Distinct from the public webhook
// signature; this is the internal service-to-service secret.
import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { type BoostEventContent } from '@blackout/protocol';
import { listBoosts, upsertBoost } from '../services/fbmMatrixBridge/boost';
import { incrementCounter, logEvent } from '../services/marketplaceObservability';

const boostEvents = new Hono();

const milestoneSchema = z.object({
    atCents: z.number().positive(),
    reward: z.string().min(1),
});

const updateSchema = z.object({
    roomId: z.string().min(1),
    boost: z.object({
        schemaVersion: z.number(),
        boostId: z.string().min(1),
        type: z.enum(['hype_train', 'fundraiser_rally', 'proposal_boost', 'bounty_boost']),
        goalCents: z.number().positive(),
        currentCents: z.number().min(0),
        currency: z.string().min(1),
        milestones: z.array(milestoneSchema),
        startedAt: z.string().min(1),
        expiresAt: z.string().min(1),
        linkedProductId: z.string().optional(),
        linkedProposalId: z.string().optional(),
        linkedBountyId: z.string().optional(),
        status: z.enum(['active', 'completed', 'expired']).optional(),
    }),
});

function internalSecretValid(provided: string | undefined): boolean {
    const expected = process.env.BLACKOUT_INTERNAL_SECRET;
    if (!expected || !provided) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

boostEvents.post('/update', async (c) => {
    if (!internalSecretValid(c.req.header('x-bmc-internal-secret'))) {
        return c.json({ error: 'unauthorized' }, 401);
    }
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: 'invalid_json' }, 400);
    }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'invalid_payload', detail: parsed.error.flatten() }, 400);
    }
    const boost = parsed.data.boost as BoostEventContent;
    const result = await upsertBoost({ roomId: parsed.data.roomId, boost });
    if (!result.ok) {
        if (result.reason === 'invalid_payload') {
            return c.json({ error: 'invalid_payload' }, 400);
        }
        incrementCounter('boost_event_update_failed');
        return c.json({ error: 'matrix_error' }, 502);
    }
    incrementCounter('boost_event_updated');
    logEvent('boost_event_updated', {
        roomId: parsed.data.roomId,
        boostId: boost.boostId,
        currentCents: boost.currentCents,
        goalCents: boost.goalCents,
    });
    return c.json({ ok: true, matrixEventId: result.matrixEventId });
});

boostEvents.get('/:roomId', async (c) => {
    if (!internalSecretValid(c.req.header('x-bmc-internal-secret'))) {
        return c.json({ error: 'unauthorized' }, 401);
    }
    const boosts = await listBoosts(c.req.param('roomId'));
    return c.json({ boosts });
});

export default boostEvents;
