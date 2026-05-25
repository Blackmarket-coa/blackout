import { Hono } from 'hono';
import { z } from 'zod';
import {
    COLISEUM_STANCES,
    COLISEUM_TOPIC_CATEGORY_KEYS,
    validateArgumentMedia,
    validateCitations,
    type ColiseumArgumentMedia,
    type ColiseumCitation,
    type ColiseumTopicStatus,
} from '@blackout/core';
import {
    castVote,
    createArgument,
    createTopic,
    getArgument,
    getTopic,
    getVerdict,
    listArgumentsForTopic,
    listTopics,
    newArgumentId,
    newTopicId,
} from '../services/coliseumStore';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';

const coliseum = new Hono();

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

coliseum.post('/topics', async (c) => {
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
    stance: z.enum(COLISEUM_STANCES as unknown as [string, ...string[]]),
    stanceWeight: z.number().min(0).max(1).default(0.5),
    body: z.string().min(1).max(4000),
    citations: z.array(citationSchema).max(16).default([]),
    // Loose at the boundary; `validateArgumentMedia` enforces the mxc shape and
    // drops anything malformed rather than rejecting the whole argument.
    media: z.record(z.string(), z.unknown()).optional(),
});

coliseum.post('/arguments', async (c) => {
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
        authorId: user.sub,
        stance: parsed.stance as never,
        stanceWeight: parsed.stanceWeight,
        body: parsed.body,
        citations: validatedCitations,
        media: validatedMedia,
    });
    if (!created) {
        return c.json({ code: 'not_found', message: 'Topic not found' }, 404);
    }
    return c.json({ argument: created }, 201);
});

const voteSchema = z.object({
    direction: z.enum(['up', 'down']),
    stanceShift: z.number().min(-1).max(1).optional(),
});

coliseum.post('/arguments/:id/vote', async (c) => {
    const user = requireUser(c, 'Sign in to vote');
    if (user instanceof Response) return user;
    const argumentId = c.req.param('id');
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

export default coliseum;
