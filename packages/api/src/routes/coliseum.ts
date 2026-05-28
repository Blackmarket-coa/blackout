import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
    COLISEUM_STANCES,
    COLISEUM_TOPIC_CATEGORY_KEYS,
    isValidLiveRoomId,
    validateArgumentMedia,
    validateCitation,
    validateCitations,
    type ColiseumArgumentMedia,
    type ColiseumCitation,
    type ColiseumTopicStatus,
    type PinnedEvidence,
} from '@blackout/core';
import {
    castVote,
    createArgument,
    createLiveSession,
    createTopic,
    endLiveSession,
    getActiveSessionForTopic,
    getArgument,
    getTopic,
    getVerdict,
    grantSpeak,
    listArgumentsForTopic,
    listCrossTopicReel,
    listTopics,
    newArgumentId,
    newTopicId,
    pinSessionEvidence,
    requestSpeak,
    revokeSpeak,
    unpinSessionEvidence,
} from '../services/coliseumStore';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { createRateLimit } from '../middleware/rate-limit';

const coliseum = new Hono();

/** Authenticated user id, used to key write rate limits per account (not per IP). */
const rateLimitUser = (c: Context): string | undefined => {
    const user = c.get('user') as { sub?: string } | null | undefined;
    return user?.sub ?? undefined;
};

const envMax = (name: string, fallback: number): number => {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Per-user write limits keep the public discourse surface from being flooded.
// Anonymous requests (which 401 in the handler anyway) fall back to per-IP keying.
const topicRateLimit = createRateLimit({
    bucket: 'coliseum-topic',
    windowMs: 60_000,
    maxRequests: envMax('COLISEUM_TOPIC_RATE_LIMIT_MAX', 20),
    identify: rateLimitUser,
});
const argumentRateLimit = createRateLimit({
    bucket: 'coliseum-argument',
    windowMs: 60_000,
    maxRequests: envMax('COLISEUM_ARGUMENT_RATE_LIMIT_MAX', 30),
    identify: rateLimitUser,
});
const voteRateLimit = createRateLimit({
    bucket: 'coliseum-vote',
    windowMs: 60_000,
    maxRequests: envMax('COLISEUM_VOTE_RATE_LIMIT_MAX', 60),
    identify: rateLimitUser,
});
const liveRateLimit = createRateLimit({
    bucket: 'coliseum-live',
    windowMs: 60_000,
    maxRequests: envMax('COLISEUM_LIVE_RATE_LIMIT_MAX', 30),
    identify: rateLimitUser,
});

// All live-session mutations (create, request/grant/revoke speak, pin, end).
coliseum.use('/live/*', liveRateLimit);

const topicStatusValues: [ColiseumTopicStatus, ...ColiseumTopicStatus[]] = [
    'emerging',
    'active',
    'closing',
    'archived',
];

const topicsQuerySchema = z.object({
    canopyId: z.string().optional(),
    denId: z.string().optional(),
    category: z.enum(COLISEUM_TOPIC_CATEGORY_KEYS as [string, ...string[]]).optional(),
    tag: z.string().optional(),
    status: z.enum(topicStatusValues).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

coliseum.get('/topics', (c) => {
    const parsed = topicsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
        return c.json(
            {
                code: 'invalid_request',
                message: 'Invalid topics query',
                details: { issues: parsed.error.issues.map((i) => i.message) },
            },
            400,
        );
    }
    const { canopyId, denId, category, tag, status, limit } = parsed.data;
    const topics = listTopics({
        canopyId,
        denId,
        category: category as never,
        tag,
        status,
    });
    return c.json({
        generatedAt: new Date().toISOString(),
        topics: limit ? topics.slice(0, limit) : topics,
    });
});

coliseum.get('/topics/:id', (c) => {
    const topic = getTopic(c.req.param('id'));
    if (!topic) {
        return c.json({ code: 'not_found', message: 'Topic not found' }, 404);
    }
    return c.json({
        topic,
        arguments: listArgumentsForTopic(topic.id),
    });
});

const newsAnchorSchema = z.object({
    sourceUrl: z.string().url().max(2048),
    headline: z.string().min(1).max(280),
    publishedAt: z.string().datetime(),
    opengraphImage: z.string().url().max(2048).optional(),
});

const createTopicSchema = z.object({
    title: z.string().min(1).max(200),
    newsAnchor: newsAnchorSchema,
    tags: z.array(z.string().min(1).max(40)).max(12).default([]),
    category: z.enum(COLISEUM_TOPIC_CATEGORY_KEYS as [string, ...string[]]).optional(),
    canopyId: z.string().optional(),
    denId: z.string().optional(),
    closesAt: z.string().datetime().optional(),
    archivesAt: z.string().datetime().optional(),
});

coliseum.post('/topics', topicRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to create a debate topic');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createTopicSchema);
    if (parsed instanceof Response) return parsed;
    const topic = createTopic({
        id: newTopicId(),
        title: parsed.title,
        newsAnchor: parsed.newsAnchor,
        tags: parsed.tags,
        category: parsed.category as never,
        canopyId: parsed.canopyId,
        denId: parsed.denId,
        closesAt: parsed.closesAt,
        archivesAt: parsed.archivesAt,
    });
    return c.json({ topic }, 201);
});

// Loose at the boundary; ColiseumCitation discriminator + identifier checks are
// enforced inside `validateCitations`, which silently drops unknown/invalid
// entries so a single bad citation doesn't reject the whole argument.
const citationSchema = z.record(z.string(), z.unknown());

const createArgumentSchema = z.object({
    topicId: z.string().min(1),
    parentArgumentId: z.string().min(1).optional(),
    stance: z.enum(COLISEUM_STANCES as unknown as [string, ...string[]]),
    stanceWeight: z.number().min(0).max(1).default(0.5),
    body: z.string().min(1).max(4000),
    citations: z.array(citationSchema).max(16).default([]),
    // Loose at the boundary; `validateArgumentMedia` enforces the mxc shape and
    // drops anything malformed rather than rejecting the whole argument.
    media: z.record(z.string(), z.unknown()).optional(),
});

coliseum.post('/arguments', argumentRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to post an argument');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createArgumentSchema);
    if (parsed instanceof Response) return parsed;
    const validatedCitations: ColiseumCitation[] = validateCitations(parsed.citations);
    const validatedMedia: ColiseumArgumentMedia | undefined =
        parsed.media !== undefined ? (validateArgumentMedia(parsed.media) ?? undefined) : undefined;
    const created = createArgument({
        id: newArgumentId(),
        topicId: parsed.topicId,
        parentArgumentId: parsed.parentArgumentId,
        authorId: user.sub,
        stance: parsed.stance as never,
        stanceWeight: parsed.stanceWeight,
        body: parsed.body,
        citations: validatedCitations,
        media: validatedMedia,
    });
    if (!created) {
        return c.json({ code: 'not_found', message: 'Topic or parent argument not found' }, 404);
    }
    return c.json({ argument: created }, 201);
});

const voteSchema = z.object({
    direction: z.enum(['up', 'down']),
    stanceShift: z.number().min(-1).max(1).optional(),
});

coliseum.post('/arguments/:id/vote', voteRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to vote');
    if (user instanceof Response) return user;
    const argumentId = c.req.param('id');
    if (!argumentId) {
        return c.json({ code: 'not_found', message: 'Argument not found' }, 404);
    }
    const argument = getArgument(argumentId);
    if (!argument) {
        return c.json({ code: 'not_found', message: 'Argument not found' }, 404);
    }
    const parsed = await readJsonBody(c, voteSchema);
    if (parsed instanceof Response) return parsed;

    if (parsed.direction === 'up' && typeof parsed.stanceShift === 'number' && parsed.stanceShift < 0) {
        return c.json({ code: 'invalid_request', message: 'stanceShift must be non-negative for up votes' }, 400);
    }
    if (parsed.direction === 'down' && typeof parsed.stanceShift === 'number' && parsed.stanceShift > 0) {
        return c.json({ code: 'invalid_request', message: 'stanceShift must be non-positive for down votes' }, 400);
    }

    const result = castVote({
        argumentId,
        voterId: user.sub,
        direction: parsed.direction,
        stanceShift: parsed.stanceShift,
    });
    if (!result) {
        return c.json({ code: 'not_found', message: 'Argument not found' }, 404);
    }
    return c.json({ vote: result.vote, argument: result.argument }, 201);
});

coliseum.get('/verdict/:topicId', (c) => {
    const verdict = getVerdict(c.req.param('topicId'));
    if (!verdict) {
        return c.json({ code: 'not_found', message: 'Topic not found' }, 404);
    }
    return c.json({ verdict });
});

// --- Cross-topic discourse reel (Feature 3) ---

const reelQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});

coliseum.get('/reel', (c) => {
    const parsed = reelQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
        return c.json(
            {
                code: 'invalid_request',
                message: 'Invalid reel query',
                details: { issues: parsed.error.issues.map((i) => i.message) },
            },
            400,
        );
    }
    const { items, nextOffset } = listCrossTopicReel({
        limit: parsed.data.limit,
        offset: parsed.data.offset,
    });
    return c.json({ generatedAt: new Date().toISOString(), items, nextOffset });
});

// --- Live debate sessions (Feature 2) ---

const createLiveSessionSchema = z.object({
    topicId: z.string().min(1),
    roomId: z.string().min(1),
});

coliseum.post('/live/sessions', async (c) => {
    const user = requireUser(c, 'Sign in to start a live debate');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createLiveSessionSchema);
    if (parsed instanceof Response) return parsed;
    if (!isValidLiveRoomId(parsed.roomId)) {
        return c.json({ code: 'invalid_request', message: 'Invalid room id' }, 400);
    }
    const session = createLiveSession({
        topicId: parsed.topicId,
        roomId: parsed.roomId,
        moderatorId: user.sub,
    });
    if (!session) {
        return c.json({ code: 'not_found', message: 'Topic not found' }, 404);
    }
    return c.json({ session }, 201);
});

coliseum.get('/live/sessions/:topicId', (c) => {
    const session = getActiveSessionForTopic(c.req.param('topicId'));
    return c.json({ session: session ?? null });
});

/** Map a store result (null = not found, 'forbidden' = not a moderator) to a Response, or return the session. */
function liveResult<T extends { id: string }>(
    c: Parameters<typeof requireUser>[0],
    result: T | null | 'forbidden',
) {
    if (result === null) {
        return c.json({ code: 'not_found', message: 'Live session not found' }, 404);
    }
    if (result === 'forbidden') {
        return c.json({ code: 'forbidden', message: 'Moderator role required' }, 403);
    }
    return c.json({ session: result });
}

coliseum.post('/live/sessions/:id/speak', (c) => {
    const user = requireUser(c, 'Sign in to request to speak');
    if (user instanceof Response) return user;
    const session = requestSpeak(c.req.param('id'), user.sub);
    if (!session) {
        return c.json({ code: 'not_found', message: 'Live session not found' }, 404);
    }
    return c.json({ session });
});

coliseum.post('/live/sessions/:id/speak/:userId/grant', (c) => {
    const user = requireUser(c, 'Sign in to moderate');
    if (user instanceof Response) return user;
    const result = grantSpeak(c.req.param('id'), user.sub, c.req.param('userId'));
    return liveResult(c, result);
});

coliseum.post('/live/sessions/:id/speak/:userId/revoke', (c) => {
    const user = requireUser(c, 'Sign in to moderate');
    if (user instanceof Response) return user;
    const result = revokeSpeak(c.req.param('id'), user.sub, c.req.param('userId'));
    return liveResult(c, result);
});

const pinSchema = z.union([
    z.object({ argumentId: z.string().min(1) }),
    z.object({ citation: z.record(z.string(), z.unknown()) }),
]);

function resolvePinnedEvidence(input: z.infer<typeof pinSchema>): PinnedEvidence | null {
    if ('argumentId' in input) {
        return getArgument(input.argumentId) ? { kind: 'argument', argumentId: input.argumentId } : null;
    }
    const citation = validateCitation(input.citation);
    return citation ? { kind: 'citation', citation } : null;
}

coliseum.post('/live/sessions/:id/pin', async (c) => {
    const user = requireUser(c, 'Sign in to moderate');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, pinSchema);
    if (parsed instanceof Response) return parsed;
    const evidence = resolvePinnedEvidence(parsed);
    if (!evidence) {
        return c.json({ code: 'invalid_request', message: 'Invalid evidence reference' }, 400);
    }
    const result = pinSessionEvidence(c.req.param('id'), user.sub, evidence);
    return liveResult(c, result);
});

coliseum.post('/live/sessions/:id/unpin', async (c) => {
    const user = requireUser(c, 'Sign in to moderate');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, pinSchema);
    if (parsed instanceof Response) return parsed;
    const evidence = resolvePinnedEvidence(parsed);
    if (!evidence) {
        return c.json({ code: 'invalid_request', message: 'Invalid evidence reference' }, 400);
    }
    const result = unpinSessionEvidence(c.req.param('id'), user.sub, evidence);
    return liveResult(c, result);
});

coliseum.post('/live/sessions/:id/end', (c) => {
    const user = requireUser(c, 'Sign in to moderate');
    if (user instanceof Response) return user;
    const result = endLiveSession(c.req.param('id'), user.sub);
    return liveResult(c, result);
});

export default coliseum;
