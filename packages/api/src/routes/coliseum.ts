import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
    COLISEUM_KNOWLEDGE_KINDS,
    COLISEUM_STANCES,
    COLISEUM_TOPIC_CATEGORY_KEYS,
    EXPLAINER_BODY_MAX_CHARS,
    EXPLAINER_MAX_COUNTERPOINTS,
    EXPLAINER_MAX_TAGS,
    EXPLAINER_TITLE_MAX_CHARS,
    COLISEUM_ROUND_KINDS,
    CRUCIBLE_CHOICES,
    CRUCIBLE_QUESTIONS,
    FINAL_STATEMENT_MAX_CHARS,
    cooldownRemainingMs,
    isColiseumMatchType,
    isCrucibleQuestionId,
    isUnderCooldown,
    isValidLiveRoomId,
    validateArgumentMedia,
    validateCitation,
    validateCitations,
    type ColiseumArgumentMedia,
    type ColiseumCitation,
    type ColiseumTopicSeed,
    type ColiseumTopicStatus,
    type PinnedEvidence,
} from '@blackout/core';
import {
    acceptMatch,
    castRoundVote,
    castSynthesisVote,
    challengeStatusFor,
    createMatch,
    declineMatch,
    getBrief,
    getBriefForMatch,
    getMatch,
    lastMatchEndedAt,
    listBriefs,
    listMatches,
    listRounds,
    markChallengeSeen,
    mintVerdict,
    openCrucible,
    postFinalStatement,
    postRound,
    roundTally,
} from '../services/coliseumMatchStore';
import {
    createExplainer,
    getExplainer,
    listKnowledgeEntries,
    voteExplainer,
} from '../services/coliseumKnowledge';
import {
    createShout,
    getShout,
    graduateToMatch,
    listRankedResponseDrops,
    listShouts,
    detectShoutBilateral,
    postResponseDrop,
    voteResponseDrop,
} from '../services/coliseumShoutStore';
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
    linkTopicDiscussionDen,
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
import { CHALLENGE_STATUSES, LEADERBOARD_CATEGORIES, isLeaderboardCategory } from '@blackout/core';
import {
    createChallenge,
    createEntry,
    getChallenge,
    getEntry,
    linkEntryDiscussionDen,
    listChallenges,
    listRankedEntries,
    newChallengeId,
    newEntryId,
    updateChallengeStatus,
    voteForEntry,
} from '../services/coliseumChallenges';
import { leaderboard } from '../services/leaderboards';

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
const matchRateLimit = createRateLimit({
    bucket: 'coliseum-match',
    windowMs: 60_000,
    maxRequests: envMax('COLISEUM_MATCH_RATE_LIMIT_MAX', 30),
    identify: rateLimitUser,
});
const roundRateLimit = createRateLimit({
    bucket: 'coliseum-round',
    windowMs: 60_000,
    maxRequests: envMax('COLISEUM_ROUND_RATE_LIMIT_MAX', 60),
    identify: rateLimitUser,
});
const shoutRateLimit = createRateLimit({
    bucket: 'coliseum-shout',
    windowMs: 60_000,
    maxRequests: envMax('COLISEUM_SHOUT_RATE_LIMIT_MAX', 30),
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
            400
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

const topicSeedMediaSchema = z.object({
    kind: z.enum(['video', 'image']),
    mxc: z.string().min(1).max(2048),
    posterMxc: z.string().min(1).max(2048).optional(),
    durationMs: z.number().int().nonnegative().optional(),
});

/**
 * A topic can be proposed in any of four forms. `link` carries the same fields
 * the old required `newsAnchor` did, so the migration is a rename plus a
 * discriminator.
 */
const topicSeedSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text') }),
    newsAnchorSchema.extend({ kind: z.literal('link') }),
    z.object({ kind: z.literal('media'), media: topicSeedMediaSchema }),
    z.object({
        kind: z.literal('challenge'),
        opponentId: z.string().min(1).max(255).optional(),
        open: z.boolean().optional(),
    }),
]);

const createTopicSchema = z
    .object({
        title: z.string().min(1).max(200),
        seed: topicSeedSchema.optional(),
        // Kept so a client built before seeds keeps working; normalized to a
        // link seed below.
        newsAnchor: newsAnchorSchema.optional(),
        tags: z.array(z.string().min(1).max(40)).max(12).default([]),
        category: z.enum(COLISEUM_TOPIC_CATEGORY_KEYS as [string, ...string[]]).optional(),
        canopyId: z.string().optional(),
        denId: z.string().optional(),
        closesAt: z.string().datetime().optional(),
        archivesAt: z.string().datetime().optional(),
    })
    .refine((body) => body.seed !== undefined || body.newsAnchor !== undefined, {
        message: 'Provide a seed describing how the topic was proposed',
        path: ['seed'],
    });

coliseum.post('/topics', topicRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to create a debate topic');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createTopicSchema);
    if (parsed instanceof Response) return parsed;
    const topic = createTopic({
        id: newTopicId(),
        title: parsed.title,
        // `createTopic` resolves seed-or-anchor; a challenge seed additionally
        // records who was called out.
        seed: parsed.seed as ColiseumTopicSeed | undefined,
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

const linkDenSchema = z.object({
    denRoomId: z.string().min(1).max(255),
});

/**
 * Attach the canopy den backing a topic's discussion.
 *
 * Every conversation in Blackout is a Matrix room — no feature ships its own
 * message store. The den is created client-side (the API has no Matrix identity
 * for the user) and lazily, on the first comment, so a throwaway topic never
 * mints a room and clutters a canopy's channel list.
 *
 * Idempotent and first-writer-wins: a caller that loses the race gets the
 * existing den back with `created: false` and should abandon the room it made.
 */
coliseum.post('/topics/:id/den', topicRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to start a discussion');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, linkDenSchema);
    if (parsed instanceof Response) return parsed;

    const topicId = c.req.param('id');
    const result = topicId ? linkTopicDiscussionDen(topicId, parsed.denRoomId) : null;
    if (!result) {
        return c.json({ code: 'not_found', message: 'Topic not found' }, 404);
    }
    return c.json({ topic: result.topic, created: result.created }, result.created ? 201 : 200);
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
        parsed.media !== undefined ? validateArgumentMedia(parsed.media) ?? undefined : undefined;
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
            400
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
    result: T | null | 'forbidden'
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
        return getArgument(input.argumentId)
            ? { kind: 'argument', argumentId: input.argumentId }
            : null;
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

// --- challenges ---

coliseum.get('/challenges', (c) => {
    const status = c.req.query('status');
    const statusFilter =
        status && (CHALLENGE_STATUSES as readonly string[]).includes(status)
            ? (status as typeof CHALLENGE_STATUSES[number])
            : undefined;
    return c.json({ challenges: listChallenges({ status: statusFilter }) });
});

coliseum.get('/challenges/:id', (c) => {
    const challenge = getChallenge(c.req.param('id'));
    if (!challenge) return c.json({ code: 'not_found', message: 'Challenge not found' }, 404);
    return c.json({ challenge, entries: listRankedEntries(challenge.id) });
});

const createChallengeSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    category: z.string().min(1).max(64),
});

coliseum.post('/challenges', async (c) => {
    const user = requireUser(c, 'Sign in to create a challenge');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createChallengeSchema);
    if (parsed instanceof Response) return parsed;
    const challenge = createChallenge({
        id: newChallengeId(),
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
        creatorId: user.sub,
    });
    return c.json({ challenge }, 201);
});

const updateChallengeSchema = z.object({ status: z.enum(CHALLENGE_STATUSES) });

coliseum.patch('/challenges/:id', async (c) => {
    const user = requireUser(c, 'Sign in to update a challenge');
    if (user instanceof Response) return user;
    const challenge = getChallenge(c.req.param('id'));
    if (!challenge) return c.json({ code: 'not_found', message: 'Challenge not found' }, 404);
    if (challenge.creatorId !== user.sub) {
        return c.json({ code: 'forbidden', message: 'Not your challenge' }, 403);
    }
    const parsed = await readJsonBody(c, updateChallengeSchema);
    if (parsed instanceof Response) return parsed;
    const updated = updateChallengeStatus(challenge.id, parsed.status);
    return c.json({ challenge: updated });
});

const createEntrySchema = z.object({
    title: z.string().min(1).max(200),
    body: z.string().max(8000).optional(),
    mediaUrl: z.string().max(2048).optional(),
});

coliseum.post('/challenges/:id/entries', async (c) => {
    const user = requireUser(c, 'Sign in to enter a challenge');
    if (user instanceof Response) return user;
    const challenge = getChallenge(c.req.param('id'));
    if (!challenge) return c.json({ code: 'not_found', message: 'Challenge not found' }, 404);
    if (challenge.status !== 'open') {
        return c.json(
            { code: 'challenge_closed', message: 'Challenge is not open for entries' },
            409
        );
    }
    const parsed = await readJsonBody(c, createEntrySchema);
    if (parsed instanceof Response) return parsed;
    const entry = createEntry({
        id: newEntryId(),
        challengeId: challenge.id,
        entrantId: user.sub,
        title: parsed.title,
        body: parsed.body,
        mediaUrl: parsed.mediaUrl,
    });
    return c.json({ entry }, 201);
});

coliseum.post('/challenges/entries/:entryId/vote', (c) => {
    const user = requireUser(c, 'Sign in to vote');
    if (user instanceof Response) return user;
    const entry = getEntry(c.req.param('entryId'));
    if (!entry) return c.json({ code: 'not_found', message: 'Entry not found' }, 404);
    voteForEntry(entry.id, user.sub);
    return c.json({ entries: listRankedEntries(entry.challengeId) });
});

/**
 * Attach the canopy den backing a challenge entry's discussion.
 *
 * Same lazy, client-created, first-writer-wins contract as
 * `POST /topics/:id/den` — the API has no Matrix identity for the user, and a
 * den per entry created eagerly would bury a canopy's channel list.
 */
coliseum.post('/challenges/entries/:entryId/den', topicRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to start a discussion');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, linkDenSchema);
    if (parsed instanceof Response) return parsed;

    const entryId = c.req.param('entryId');
    const result = entryId ? linkEntryDiscussionDen(entryId, parsed.denRoomId) : null;
    if (!result) {
        return c.json({ code: 'not_found', message: 'Entry not found' }, 404);
    }
    return c.json({ entry: result.entry, created: result.created }, result.created ? 201 : 200);
});

// --- leaderboards ---

coliseum.get('/leaderboards', (c) => {
    const category = c.req.query('category') ?? 'creators';
    if (!isLeaderboardCategory(category)) {
        return c.json(
            {
                code: 'invalid_category',
                message: `category must be one of ${LEADERBOARD_CATEGORIES.join(', ')}`,
            },
            400
        );
    }
    const region = c.req.query('region');
    const limitRaw = Number.parseInt(c.req.query('limit') ?? '', 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    return c.json({ category, entries: leaderboard(category, { region, limit }) });
});

// --- per-creator public summary ---

// Public: a creator's Coliseum standing for the public profile page. Aggregates
// challenges they run, challenges they've entered (with rank/wins) and their
// creators-leaderboard placement. No auth required — read-only public data.
coliseum.get('/creators/:userId', (c) => {
    const userId = decodeURIComponent(c.req.param('userId'));

    const challengesRun = listChallenges({}).filter((ch) => ch.creatorId === userId);

    const entries: Array<{
        challengeId: string;
        challengeTitle: string;
        entryId: string;
        title: string;
        votes: number;
        rank: number;
    }> = [];
    for (const challenge of listChallenges({})) {
        for (const entry of listRankedEntries(challenge.id)) {
            if (entry.entrantId !== userId) continue;
            entries.push({
                challengeId: challenge.id,
                challengeTitle: challenge.title,
                entryId: entry.id,
                title: entry.title,
                votes: entry.votes,
                rank: entry.rank,
            });
        }
    }
    const wins = entries.filter((entry) => entry.rank === 1).length;

    const placement = leaderboard('creators', {}).find((entry) => entry.id === userId) ?? null;

    return c.json({
        userId,
        challengesRun,
        entries,
        wins,
        leaderboard: placement,
    });
});

// --- Matches (the gladiatorial layer) ---

const domainEnum = z.enum(COLISEUM_TOPIC_CATEGORY_KEYS as [string, ...string[]]);

const createMatchSchema = z.object({
    proposition: z.string().min(1).max(500),
    propositionTopicId: z.string().min(1).optional(),
    domain: domainEnum.optional(),
    type: z.string().optional(),
    opponentId: z.string().min(1).optional(),
    open: z.boolean().optional(),
    denRoomId: z.string().min(1).optional(),
    roundWindowMs: z
        .number()
        .int()
        .min(60_000)
        .max(7 * 24 * 60 * 60 * 1000)
        .optional(),
});

coliseum.post('/matches', matchRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to issue a Callout');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createMatchSchema);
    if (parsed instanceof Response) return parsed;

    const lastEnded = lastMatchEndedAt(user.sub);
    if (isUnderCooldown(lastEnded)) {
        return c.json(
            {
                code: 'cooldown',
                message: 'You are within the 48-hour cool-down after your last match.',
                details: { remainingMs: cooldownRemainingMs(lastEnded) },
            },
            409
        );
    }

    const match = createMatch({
        challengerId: user.sub,
        proposition: parsed.proposition,
        propositionTopicId: parsed.propositionTopicId,
        domain: parsed.domain as never,
        type: isColiseumMatchType(parsed.type) ? parsed.type : 'callout',
        opponentId: parsed.opponentId,
        open: parsed.open,
        denRoomId: parsed.denRoomId,
        roundWindowMs: parsed.roundWindowMs,
    });
    return c.json({ match, challengeStatus: challengeStatusFor(match) }, 201);
});

const matchesQuerySchema = z.object({
    domain: domainEnum.optional(),
    status: z.enum(['pending', 'accepted', 'live', 'crucible', 'verdict', 'archived']).optional(),
    fighterId: z.string().optional(),
    propositionTopicId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

coliseum.get('/matches', (c) => {
    const parsed = matchesQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
        return c.json({ code: 'invalid_request', message: 'Invalid matches query' }, 400);
    }
    const matches = listMatches({
        domain: parsed.data.domain as never,
        status: parsed.data.status,
        fighterId: parsed.data.fighterId,
        propositionTopicId: parsed.data.propositionTopicId,
    });
    return c.json({
        generatedAt: new Date().toISOString(),
        matches: parsed.data.limit ? matches.slice(0, parsed.data.limit) : matches,
    });
});

/** True if the (optional) caller is one of the match's fighters. */
function callerIsFighter(
    c: Context,
    match: { challengerId: string; opponentId?: string }
): boolean {
    const user = c.get('user') as { sub?: string } | null | undefined;
    const sub = user?.sub;
    return Boolean(sub && (match.challengerId === sub || match.opponentId === sub));
}

coliseum.get('/matches/:id', (c) => {
    const match = getMatch(c.req.param('id'));
    if (!match) return c.json({ code: 'not_found', message: 'Match not found' }, 404);
    const rounds = listRounds(match.id);
    // Fighters argue blind: withhold per-round tallies until the match ends.
    const ended = match.status === 'verdict' || match.status === 'archived';
    const showTallies = ended || !callerIsFighter(c, match);
    const tallies = showTallies
        ? rounds.map((r) => ({ roundIndex: r.index, ...roundTally(match.id, r.index) }))
        : undefined;
    return c.json({
        match,
        rounds,
        tallies,
        challengeStatus: challengeStatusFor(match),
        brief: getBriefForMatch(match.id),
    });
});

coliseum.get('/matches/:id/link', (c) => {
    const match = getMatch(c.req.param('id'));
    if (!match) return c.json({ code: 'not_found', message: 'Match not found' }, 404);
    return c.json({
        token: match.challengeToken ?? null,
        status: challengeStatusFor(match),
        path: match.challengeToken ? `/coliseum/c/${match.challengeToken}` : null,
    });
});

// Public dodge ping — recorded when the Challenge Link preview is opened.
coliseum.post('/matches/:id/seen', (c) => {
    const match = markChallengeSeen(c.req.param('id'));
    if (!match) return c.json({ code: 'not_found', message: 'Match not found' }, 404);
    return c.json({ status: challengeStatusFor(match) });
});

function matchActionResult(
    c: Context,
    result: { challengerId: string } | 'not_found' | 'forbidden' | 'not_pending'
) {
    if (result === 'not_found')
        return c.json({ code: 'not_found', message: 'Match not found' }, 404);
    if (result === 'forbidden')
        return c.json({ code: 'forbidden', message: 'Not your challenge' }, 403);
    if (result === 'not_pending') {
        return c.json({ code: 'conflict', message: 'Challenge is no longer pending' }, 409);
    }
    return c.json({ match: result });
}

coliseum.post('/matches/:id/accept', matchRateLimit, (c) => {
    const user = requireUser(c, 'Sign in to accept a challenge');
    if (user instanceof Response) return user;
    return matchActionResult(c, acceptMatch(c.req.param('id') ?? '', user.sub));
});

coliseum.post('/matches/:id/decline', matchRateLimit, (c) => {
    const user = requireUser(c, 'Sign in to decline a challenge');
    if (user instanceof Response) return user;
    return matchActionResult(c, declineMatch(c.req.param('id') ?? '', user.sub));
});

const createRoundSchema = z.object({
    kind: z.enum(COLISEUM_ROUND_KINDS as unknown as [string, ...string[]]),
    body: z.string().max(4000).optional(),
    media: z.record(z.string(), z.unknown()).optional(),
    citations: z.array(z.record(z.string(), z.unknown())).max(16).default([]),
});

coliseum.post('/matches/:id/rounds', roundRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to post a round');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createRoundSchema);
    if (parsed instanceof Response) return parsed;
    const media: ColiseumArgumentMedia | undefined =
        parsed.media !== undefined ? validateArgumentMedia(parsed.media) ?? undefined : undefined;
    const citations: ColiseumCitation[] = validateCitations(parsed.citations);
    const result = postRound({
        matchId: c.req.param('id') ?? '',
        authorId: user.sub,
        kind: parsed.kind as never,
        body: parsed.body,
        media,
        citations,
    });
    if (!result.ok) {
        const map: Record<string, [number, string]> = {
            not_found: [404, 'Match not found'],
            forbidden: [403, 'Only fighters can post rounds'],
            not_live: [409, 'Match is not live'],
            duration: [400, 'Round video exceeds the 3-minute cap'],
            steelman_required: [409, 'Post a steel-man round before rebutting'],
        };
        const [status, message] = map[result.reason] ?? [400, 'Invalid round'];
        return c.json({ code: result.reason, message }, status as never);
    }
    return c.json({ round: result.round }, 201);
});

const roundVoteSchema = z.object({ choice: z.enum(['red', 'blue', 'draw']) });

coliseum.post('/matches/:id/rounds/:idx/vote', roundRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to vote');
    if (user instanceof Response) return user;
    const roundIndex = Number.parseInt(c.req.param('idx') ?? '', 10);
    if (!Number.isInteger(roundIndex) || roundIndex < 0) {
        return c.json({ code: 'invalid_request', message: 'Invalid round index' }, 400);
    }
    const parsed = await readJsonBody(c, roundVoteSchema);
    if (parsed instanceof Response) return parsed;
    const vote = castRoundVote({
        matchId: c.req.param('id') ?? '',
        roundIndex,
        voterId: user.sub,
        choice: parsed.choice,
    });
    if (!vote) {
        return c.json({ code: 'forbidden', message: 'Match not found or you are a fighter' }, 403);
    }
    return c.json({ vote }, 201);
});

coliseum.post('/matches/:id/crucible/open', matchRateLimit, (c) => {
    const user = requireUser(c, 'Sign in to open the Crucible');
    if (user instanceof Response) return user;
    const match = getMatch(c.req.param('id') ?? '');
    if (!match) return c.json({ code: 'not_found', message: 'Match not found' }, 404);
    if (match.challengerId !== user.sub && match.opponentId !== user.sub) {
        return c.json({ code: 'forbidden', message: 'Only fighters can open the Crucible' }, 403);
    }
    const updated = openCrucible(match.id);
    return c.json({ match: updated });
});

coliseum.get('/crucible/questions', (c) => c.json({ questions: CRUCIBLE_QUESTIONS }));

const statementSchema = z.object({
    body: z.string().max(FINAL_STATEMENT_MAX_CHARS).optional(),
    mediaMxc: z.string().max(2048).optional(),
});

coliseum.post('/matches/:id/crucible/statement', matchRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to submit your final statement');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, statementSchema);
    if (parsed instanceof Response) return parsed;
    const result = postFinalStatement({
        matchId: c.req.param('id') ?? '',
        authorId: user.sub,
        body: parsed.body,
        mediaMxc: parsed.mediaMxc,
    });
    if (!result.ok) {
        const map: Record<string, [number, string]> = {
            not_found: [404, 'Match not found'],
            forbidden: [403, 'Only fighters submit final statements'],
            not_crucible: [409, 'The Crucible is not open'],
        };
        const [status, message] = map[result.reason] ?? [400, 'Invalid statement'];
        return c.json({ code: result.reason, message }, status as never);
    }
    return c.json({ ok: true }, 201);
});

const synthesisSchema = z.object({
    questionId: z.string().min(1),
    choice: z.enum(CRUCIBLE_CHOICES as unknown as [string, ...string[]]),
});

coliseum.post('/matches/:id/crucible/synthesis', roundRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to vote in the Crucible');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, synthesisSchema);
    if (parsed instanceof Response) return parsed;
    if (!isCrucibleQuestionId(parsed.questionId)) {
        return c.json({ code: 'invalid_request', message: 'Unknown synthesis question' }, 400);
    }
    const result = castSynthesisVote({
        matchId: c.req.param('id') ?? '',
        questionId: parsed.questionId,
        voterId: user.sub,
        choice: parsed.choice as never,
    });
    if (!result.ok) {
        const map: Record<string, [number, string]> = {
            not_found: [404, 'Match not found'],
            forbidden: [403, 'Fighters do not vote on their own match'],
            not_crucible: [409, 'The Crucible is not open'],
        };
        const [status, message] = map[result.reason] ?? [400, 'Invalid vote'];
        return c.json({ code: result.reason, message }, status as never);
    }
    return c.json({ ok: true }, 201);
});

coliseum.post('/matches/:id/verdict', matchRateLimit, (c) => {
    const user = requireUser(c, 'Sign in to close the match');
    if (user instanceof Response) return user;
    const match = getMatch(c.req.param('id') ?? '');
    if (!match) return c.json({ code: 'not_found', message: 'Match not found' }, 404);
    if (match.challengerId !== user.sub && match.opponentId !== user.sub) {
        return c.json({ code: 'forbidden', message: 'Only fighters can close the match' }, 403);
    }
    const brief = mintVerdict(match.id);
    if (!brief) return c.json({ code: 'not_found', message: 'Match not found' }, 404);
    return c.json({ brief }, 201);
});

// --- Briefs (permanent public record) ---

const briefsQuerySchema = z.object({
    fighter: z.string().optional(),
    domain: domainEnum.optional(),
    q: z.string().max(200).optional(),
});

coliseum.get('/briefs', (c) => {
    const parsed = briefsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
        return c.json({ code: 'invalid_request', message: 'Invalid briefs query' }, 400);
    }
    return c.json({
        briefs: listBriefs({
            fighterId: parsed.data.fighter ? decodeURIComponent(parsed.data.fighter) : undefined,
            domain: parsed.data.domain as never,
            query: parsed.data.q,
        }),
    });
});

coliseum.get('/briefs/:id', (c) => {
    const brief = getBrief(c.req.param('id'));
    if (!brief) return c.json({ code: 'not_found', message: 'Brief not found' }, 404);
    return c.json({ brief });
});

// --- Knowledge repository (unified archive of resolved conflict) ---

const knowledgeQuerySchema = z.object({
    q: z.string().max(200).optional(),
    domain: domainEnum.optional(),
    kind: z.enum(COLISEUM_KNOWLEDGE_KINDS as unknown as [string, ...string[]]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

coliseum.get('/knowledge', (c) => {
    const parsed = knowledgeQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
        return c.json({ code: 'invalid_request', message: 'Invalid knowledge query' }, 400);
    }
    return c.json({
        generatedAt: new Date().toISOString(),
        entries: listKnowledgeEntries({
            query: parsed.data.q,
            domain: parsed.data.domain as never,
            kind: parsed.data.kind as never,
            limit: parsed.data.limit,
        }),
    });
});

// --- Explainers (standalone authored knowledge) ---

const explainerRateLimit = createRateLimit({
    bucket: 'coliseum-explainer',
    windowMs: 60_000,
    maxRequests: envMax('COLISEUM_EXPLAINER_RATE_LIMIT_MAX', 10),
    identify: rateLimitUser,
});

const createExplainerSchema = z.object({
    title: z.string().min(1).max(EXPLAINER_TITLE_MAX_CHARS),
    body: z.string().min(1).max(EXPLAINER_BODY_MAX_CHARS),
    domain: domainEnum.optional(),
    tags: z.array(z.string().min(1).max(40)).max(EXPLAINER_MAX_TAGS).default([]),
    // Loose at the boundary; `validateCitations` drops invalid entries.
    citations: z.array(z.record(z.string(), z.unknown())).max(16).default([]),
    counterpoints: z.array(z.string().min(1).max(500)).max(EXPLAINER_MAX_COUNTERPOINTS).default([]),
});

coliseum.post('/knowledge/explainers', explainerRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to publish an explainer');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createExplainerSchema);
    if (parsed instanceof Response) return parsed;
    const explainer = createExplainer({
        authorId: user.sub,
        title: parsed.title,
        body: parsed.body,
        domain: parsed.domain as never,
        tags: parsed.tags,
        citations: parsed.citations,
        counterpoints: parsed.counterpoints,
    });
    return c.json({ explainer }, 201);
});

coliseum.get('/knowledge/explainers/:id', (c) => {
    const explainer = getExplainer(c.req.param('id'));
    if (!explainer) return c.json({ code: 'not_found', message: 'Explainer not found' }, 404);
    return c.json({ explainer });
});

const explainerVoteSchema = z.object({ direction: z.enum(['up', 'down']) });

coliseum.post('/knowledge/explainers/:id/vote', voteRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to rate an explainer');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, explainerVoteSchema);
    if (parsed instanceof Response) return parsed;
    const explainer = voteExplainer({
        explainerId: c.req.param('id') ?? '',
        voterId: user.sub,
        direction: parsed.direction,
    });
    if (!explainer) return c.json({ code: 'not_found', message: 'Explainer not found' }, 404);
    return c.json({ explainer }, 201);
});

// --- Shouts (unstructured intake) ---

const createShoutSchema = z.object({
    domain: domainEnum.optional(),
    body: z.string().max(2000).optional(),
    media: z.record(z.string(), z.unknown()),
    denRoomId: z.string().min(1).optional(),
});

coliseum.post('/shouts', shoutRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to post a Shout');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createShoutSchema);
    if (parsed instanceof Response) return parsed;
    const media = validateArgumentMedia(parsed.media);
    if (!media)
        return c.json({ code: 'invalid_request', message: 'A valid video is required' }, 400);
    const shout = createShout({
        authorId: user.sub,
        domain: parsed.domain as never,
        body: parsed.body,
        media,
        denRoomId: parsed.denRoomId,
    });
    return c.json({ shout }, 201);
});

const shoutsQuerySchema = z.object({ domain: domainEnum.optional() });

coliseum.get('/shouts', (c) => {
    const parsed = shoutsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ code: 'invalid_request', message: 'Invalid query' }, 400);
    return c.json({ shouts: listShouts({ domain: parsed.data.domain as never }) });
});

coliseum.get('/shouts/:id', (c) => {
    const shout = getShout(c.req.param('id'));
    if (!shout) return c.json({ code: 'not_found', message: 'Shout not found' }, 404);
    return c.json({
        shout,
        drops: listRankedResponseDrops(shout.id),
        bilateral: detectShoutBilateral(shout.id),
    });
});

const dropSchema = z.object({
    body: z.string().max(2000).optional(),
    media: z.record(z.string(), z.unknown()),
});

coliseum.post('/shouts/:id/drops', shoutRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to drop a response');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, dropSchema);
    if (parsed instanceof Response) return parsed;
    const media = validateArgumentMedia(parsed.media);
    if (!media)
        return c.json({ code: 'invalid_request', message: 'A valid video is required' }, 400);
    const drop = postResponseDrop({
        shoutId: c.req.param('id') ?? '',
        authorId: user.sub,
        body: parsed.body,
        media,
    });
    if (!drop) return c.json({ code: 'not_found', message: 'Shout not found' }, 404);
    return c.json({ drop }, 201);
});

const dropVoteSchema = z.object({ direction: z.enum(['up', 'down']) });

coliseum.post('/shouts/drops/:dropId/vote', shoutRateLimit, async (c) => {
    const user = requireUser(c, 'Sign in to vote');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, dropVoteSchema);
    if (parsed instanceof Response) return parsed;
    const drop = voteResponseDrop(c.req.param('dropId') ?? '', user.sub, parsed.direction);
    if (!drop) return c.json({ code: 'not_found', message: 'Response drop not found' }, 404);
    return c.json({ drop }, 201);
});

coliseum.post('/shouts/:id/graduate', shoutRateLimit, (c) => {
    const user = requireUser(c, 'Sign in to formalize a match');
    if (user instanceof Response) return user;
    const match = graduateToMatch(c.req.param('id') ?? '');
    if (!match) {
        return c.json(
            { code: 'not_bilateral', message: 'This shout has not become a bilateral fight yet' },
            409
        );
    }
    return c.json({ match }, 201);
});

export default coliseum;
