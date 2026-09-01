// User-created assets: stickers, memes and coins people make and share.
//
// Creation is open to everyone; approval is what keeps that from becoming a
// distribution channel for whatever anyone uploads. A pending asset shares with
// nobody — it cannot be relayed, and the feed's subject resolver refuses to
// render it — so there is no path by which an unreviewed upload travels.
//
// Once approved, an asset spreads the same way everything else does: a person
// relays it to their Circle. There is no promotion, no featured shelf, and no
// ranking here.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { COMMUNITY_ASSET_KINDS } from '../db/types';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { isAdminUser } from '../services/auth';
import {
    approveAsset,
    assetAttribution,
    createAsset,
    foundingStatusFor,
    rejectAsset,
    reportAsset,
    retireAsset,
} from '../services/communityAssets';

const assets = new Hono();

const requireModerator = (c: Context) => {
    const user = requireUser(c, 'Sign in required');
    if (user instanceof Response) return user;
    if (!isAdminUser(user.sub, user.username)) {
        return c.json({ code: 'forbidden', message: 'Moderator privileges required' }, 403);
    }
    return user;
};

const createSchema = z.object({
    kind: z.enum(COMMUNITY_ASSET_KINDS),
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    mediaUrl: z.string().min(1).max(2048),
});

const reviewSchema = z.object({ note: z.string().max(500).optional() });
const reportSchema = z.object({ reason: z.string().min(1).max(500) });

const failureResponse = (kind: string): { code: string; message: string; status: 400 | 404 } => {
    switch (kind) {
        case 'not_pending':
            return {
                code: 'invalid_request',
                message: 'This asset has already been reviewed',
                status: 400,
            };
        case 'not_approved':
            return {
                code: 'invalid_request',
                message: 'Only an approved asset can be retired',
                status: 400,
            };
        default:
            return { code: 'not_found', message: 'Asset not found', status: 404 };
    }
};

/** The public shelf: approved assets only. */
assets.get('/', (c) => {
    const user = requireUser(c, 'Sign in to browse assets');
    if (user instanceof Response) return user;
    const kind = c.req.query('kind');
    return c.json({
        assets: db.listCommunityAssets({ status: 'approved', kind }),
    });
});

/** Your own assets, at any status, so you can see what is still in review. */
assets.get('/mine', (c) => {
    const user = requireUser(c, 'Sign in to see your assets');
    if (user instanceof Response) return user;
    return c.json({ assets: db.listCommunityAssets({ creatorId: user.sub }) });
});

assets.post('/', async (c) => {
    const user = requireUser(c, 'Sign in to make something');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createSchema);
    if (parsed instanceof Response) return parsed;

    const asset = createAsset({
        creatorId: user.sub,
        kind: parsed.kind,
        name: parsed.name,
        description: parsed.description ?? null,
        mediaUrl: parsed.mediaUrl,
    });
    // Answered plainly so a creator knows it is not live yet.
    return c.json({ asset, shareable: false }, 201);
});

/** The moderation queue. */
assets.get('/pending', (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    return c.json({ assets: db.listCommunityAssets({ status: 'pending' }) });
});

assets.post('/:assetId/approve', async (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, reviewSchema);
    if (parsed instanceof Response) return parsed;

    const outcome = approveAsset(c.req.param('assetId'), user.sub, parsed.note ?? null);
    if (!outcome.ok) {
        const { code, message, status } = failureResponse(outcome.error.kind);
        return c.json({ code, message }, status);
    }
    return c.json({ asset: outcome.value, shareable: true });
});

assets.post('/:assetId/reject', async (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, reviewSchema);
    if (parsed instanceof Response) return parsed;

    const outcome = rejectAsset(c.req.param('assetId'), user.sub, parsed.note ?? null);
    if (!outcome.ok) {
        const { code, message, status } = failureResponse(outcome.error.kind);
        return c.json({ code, message }, status);
    }
    return c.json({ asset: outcome.value });
});

/** Stop an approved asset travelling from now on. History is untouched. */
assets.post('/:assetId/retire', async (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, reviewSchema);
    if (parsed instanceof Response) return parsed;

    const outcome = retireAsset(c.req.param('assetId'), user.sub, parsed.note ?? null);
    if (!outcome.ok) {
        const { code, message, status } = failureResponse(outcome.error.kind);
        return c.json({ code, message }, status);
    }
    return c.json({ asset: outcome.value });
});

assets.post('/:assetId/report', async (c) => {
    const user = requireUser(c, 'Sign in to report an asset');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, reportSchema);
    if (parsed instanceof Response) return parsed;

    const outcome = reportAsset(c.req.param('assetId'), user.sub, parsed.reason);
    if (!outcome.ok) {
        const { code, message, status } = failureResponse(outcome.error.kind);
        return c.json({ code, message }, status);
    }
    return c.json({ report: outcome.value }, 201);
});

/** Who made this, and what it earned them. */
assets.get('/:assetId/attribution', (c) => {
    const user = requireUser(c, 'Sign in to see attribution');
    if (user instanceof Response) return user;
    const attribution = assetAttribution(c.req.param('assetId'));
    if (!attribution) return c.json({ code: 'not_found', message: 'Asset not found' }, 404);
    return c.json(attribution);
});

/**
 * Founding Contributor credentials, and how many slots are still open.
 *
 * The remaining count is reported rather than hidden, so "be early" is a real,
 * checkable thing rather than a rumour.
 */
assets.get('/founding/:userId', (c) => {
    const user = requireUser(c, 'Sign in to see founding credentials');
    if (user instanceof Response) return user;
    return c.json(foundingStatusFor(c.req.param('userId')));
});

export default assets;
