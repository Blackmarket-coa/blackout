// Public geocaches: /v1/coalition/caches (services/coalitionCaches.ts).
//
// Off unless BLACKOUT_COALITION_CACHES is set: every route answers 404 until
// then. Every member route needs sign-in and the current "coalition-caches"
// agreement, which includes the person's statement that they are 18 or older
// (services/userConsents.ts). Moderation and exclusion zones are for the
// administrators in BLACKOUT_ADMIN_USERS, the only moderators the API has.
//
// Positions travel in request bodies, never in the URL, so access logs do not
// record them (docs/security/coalition-read-privacy-2026-11-17.md).
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { createRateLimit } from '../middleware/rate-limit';
import { isAdminUser } from '../services/auth';
import { hasCurrentConsent } from '../services/userConsents';
import {
    addExclusionZone,
    cachesEnabled,
    createCache,
    findCache,
    formatCacheCode,
    getCacheForViewer,
    listCachesForViewer,
    moderateCache,
    moderationQueue,
    removeOwnCache,
    reportCache,
    viewForViewer,
} from '../services/coalitionCaches';

const caches = new Hono();

const byUser = (c: Context) => (c.get('user') as { sub?: string } | undefined)?.sub ?? undefined;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Placing: enough for a hunt in a day, few enough to make probing the exclusion zones slow. */
const placeRateLimit = createRateLimit({
    bucket: 'coalition-cache-place',
    windowMs: DAY_MS,
    maxRequests: 10,
    identify: byUser,
});
/** Find attempts: a person copying a code wrongly a few times, not a search of the code space. */
const findRateLimit = createRateLimit({
    bucket: 'coalition-cache-find',
    windowMs: 60 * 60 * 1000,
    maxRequests: 30,
    identify: byUser,
});
const reportRateLimit = createRateLimit({
    bucket: 'coalition-cache-report',
    windowMs: DAY_MS,
    maxRequests: 20,
    identify: byUser,
});

caches.use('*', async (c, next) => {
    if (!cachesEnabled()) return c.json({ code: 'not_found', message: 'Not found' }, 404);
    await next();
});

/**
 * A signed-in person whose account still exists. A token outlives the account
 * it was issued to (deletion revokes only the token that confirmed it), and
 * data written under a deleted account would never be erased.
 */
const requireExistingUser = (c: Context) => {
    const user = requireUser(c, 'Sign in required');
    if (user instanceof Response) return user;
    if (!db.getUserById(user.sub)) {
        return c.json({ code: 'unauthorized', message: 'Sign in required' }, 401);
    }
    return user;
};

const requireConsentingUser = (c: Context) => {
    const user = requireExistingUser(c);
    if (user instanceof Response) return user;
    if (!hasCurrentConsent(user.sub, 'coalition-caches')) {
        return c.json(
            {
                code: 'consent_required',
                message:
                    'Read and agree to the caches disclosure first. It includes confirming you are 18 or older.',
            },
            403
        );
    }
    return user;
};

const requireModerator = (c: Context) => {
    const user = requireUser(c, 'Sign in required');
    if (user instanceof Response) return user;
    if (!isAdminUser(user.sub, user.username)) {
        return c.json({ code: 'forbidden', message: 'Moderator privileges required' }, 403);
    }
    return user;
};

const position = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
});
const MXC = /^mxc:\/\/[^/\s]+\/[A-Za-z0-9_-]+$/;

const createSchema = z.object({
    title: z.string().trim().min(1).max(80),
    hint: z.string().trim().max(280).optional(),
    note: z.string().trim().max(1000).optional(),
    photoMxc: z.string().regex(MXC).optional(),
    proof: z.enum(['code', 'gps']),
    position,
});
const searchSchema = z.object({ position, radiusKm: z.number().min(0.1).max(50) });
const findSchema = z.object({
    code: z.string().min(1).max(32).optional(),
    position: position.optional(),
});
const reportSchema = z.object({ reason: z.string().trim().min(1).max(500) });
const moderateSchema = z.object({
    action: z.enum(['restore', 'remove']),
    note: z.string().trim().max(500).optional(),
});
const zoneSchema = z.object({
    label: z.string().trim().min(1).max(120),
    position,
    radiusMeters: z.number().min(10).max(5000),
});

const notFound = (c: Context) => c.json({ code: 'not_found', message: 'Not found' }, 404);

// --- static paths first, so they are not read as cache ids ---

caches.get('/moderation', (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    return c.json({ queue: moderationQueue() });
});

caches.get('/exclusions', (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    return c.json({ zones: db.listCoalitionExclusionZones() });
});

caches.post('/exclusions', async (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    const body = await readJsonBody(c, zoneSchema);
    if (body instanceof Response) return body;
    return c.json({ zone: addExclusionZone(user.sub, body) }, 201);
});

caches.delete('/exclusions/:zoneId', (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    if (!db.deleteCoalitionExclusionZone(c.req.param('zoneId'))) return notFound(c);
    return c.body(null, 204);
});

caches.post('/search', async (c) => {
    const user = requireConsentingUser(c);
    if (user instanceof Response) return user;
    const body = await readJsonBody(c, searchSchema);
    if (body instanceof Response) return body;
    return c.json({ caches: listCachesForViewer(user.sub, body) });
});

caches.get('/', (c) => {
    const user = requireConsentingUser(c);
    if (user instanceof Response) return user;
    return c.json({ caches: listCachesForViewer(user.sub) });
});

caches.post('/', placeRateLimit, async (c) => {
    const user = requireConsentingUser(c);
    if (user instanceof Response) return user;
    const body = await readJsonBody(c, createSchema);
    if (body instanceof Response) return body;
    const { cache, code } = await createCache(user.sub, body);
    return c.json(
        {
            cache: viewForViewer(cache, user.sub),
            // Shown once: only its salted hash is kept.
            code: code ? formatCacheCode(code) : null,
        },
        201
    );
});

// --- one cache ---

caches.get('/:id', (c) => {
    const user = requireConsentingUser(c);
    if (user instanceof Response) return user;
    const cache = getCacheForViewer(c.req.param('id'), user.sub);
    if (!cache) return notFound(c);
    return c.json({ cache: viewForViewer(cache, user.sub) });
});

caches.delete('/:id', (c) => {
    const user = requireExistingUser(c);
    if (user instanceof Response) return user;
    // No consent check: someone who withdrew must still be able to take down what they placed.
    if (!removeOwnCache(c.req.param('id'), user.sub)) return notFound(c);
    return c.body(null, 204);
});

caches.post('/:id/find', findRateLimit, async (c) => {
    const user = requireConsentingUser(c);
    if (user instanceof Response) return user;
    const body = await readJsonBody(c, findSchema);
    if (body instanceof Response) return body;
    const id = c.req.param('id');
    if (!id) return notFound(c);
    const result = await findCache(id, user.sub, body);
    if (result.ok)
        return c.json({ found: true, foundAt: result.foundAt, findCount: result.findCount });
    switch (result.reason) {
        case 'not_found':
            return notFound(c);
        case 'own_cache':
            return c.json({ code: 'own_cache', message: 'This is your own cache.' }, 400);
        case 'code_required':
            return c.json(
                { code: 'code_required', message: 'Type the code left at the spot.' },
                400
            );
        case 'wrong_code':
            return c.json({ code: 'wrong_code', message: 'That code does not match.' }, 400);
        case 'position_required':
            return c.json(
                {
                    code: 'position_required',
                    message: 'This cache is confirmed by a GPS check-in.',
                },
                400
            );
        case 'too_far':
            return c.json(
                { code: 'too_far', message: 'You are not close enough to the spot yet.' },
                400
            );
    }
});

caches.post('/:id/report', reportRateLimit, async (c) => {
    const user = requireConsentingUser(c);
    if (user instanceof Response) return user;
    const body = await readJsonBody(c, reportSchema);
    if (body instanceof Response) return body;
    const id = c.req.param('id');
    if (!id) return notFound(c);
    const result = reportCache(id, user.sub, body.reason);
    if (!result.ok) {
        return result.reason === 'not_found'
            ? notFound(c)
            : c.json({ code: 'own_cache', message: 'This is your own cache.' }, 400);
    }
    return c.json({ reported: true }, 201);
});

caches.post('/:id/moderate', async (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    const body = await readJsonBody(c, moderateSchema);
    if (body instanceof Response) return body;
    const result = moderateCache(c.req.param('id'), user.sub, body.action, body.note);
    if (!result.ok) return notFound(c);
    const { codeSalt: _salt, codeHash: _hash, ...cache } = result.cache;
    return c.json({ cache });
});

export default caches;
