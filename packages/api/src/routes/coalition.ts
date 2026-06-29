import { Hono } from 'hono';
import { z } from 'zod';
import {
    AID_POST_CATEGORIES,
    AID_POST_TYPES,
    AID_POST_URGENCY,
    EVENT_CATEGORIES,
    EVENT_LIFECYCLE_STATUSES,
    EVENT_VISIBILITY,
    INSTALL_SCOPE_TYPES,
    KIT_DEFINITIONS,
    RECURRENCE_FREQUENCIES,
    RING_KINDS,
    RING_ROLES,
    RING_VISIBILITY,
    RSVP_STATUSES,
    SPATIAL_LAYER_KEYS,
    TASK_STATUSES,
    canManageRing,
    countActive,
    countActiveMembers,
    expandOccurrences,
    getKit,
    isWithinRadiusMeters,
    nextOccurrence,
    rankCoalitionFeed,
    seatsRemaining,
    slotRemaining,
    NEED_STATUSES,
    PROJECT_STATUSES,
    RESOURCE_AVAILABILITY,
} from '@blackout/core';
import {
    createAidPost,
    getEvent,
    getRideOffer,
    getVolunteerSlot,
    listAidPosts,
    listEventRsvps,
    listEvents,
    listFeedItems,
    listRideClaims,
    listRideOffers,
    listSellerLocations,
    listSpatialItems,
    getFeedItem,
    listFeedLikes,
    saveFeedLike,
    listFeedComments,
    createFeedComment,
    newFeedLikeId,
    newFeedCommentId,
    listVolunteerSignups,
    listVolunteerSlots,
    getRing,
    listKitApplications,
    listRingInvitations,
    listRingMemberships,
    listRings,
    newAidId,
    newEventId,
    newKitApplicationId,
    newMembershipId,
    newRingInvitationId,
    newRideClaimId,
    newRideOfferId,
    newRingId,
    newRsvpId,
    newSignupId,
    newSlotId,
    rsvpSummaryFor,
    saveEvent,
    saveRideClaim,
    saveRideOffer,
    recordKitApplication,
    saveRing,
    saveRingInvitation,
    saveRingMembership,
    saveRsvp,
    saveVolunteerSignup,
    saveVolunteerSlot,
    createNeed,
    listNeeds,
    newNeedId,
    updateNeed,
    createProject,
    getProject,
    listProjects,
    newProjectId,
    updateProject,
    updateProjectStatus,
    createResource,
    listResources,
    newResourceId,
    updateResourceAvailability,
} from '../services/coalitionStore';
import { createTask, listTasks, newTaskId, updateTaskStatus } from '../services/taskStore';
import {
    getProjectView,
    listProjectSupporters,
    projectMomentum,
} from '../services/coalitionProjectSupport';
import { createTip, TipValidationError, TIP_LIMITS } from '../services/tips';
import { authorizeScope, installPluginAtScope } from '../services/pluginInstallations';
import { db } from '../db/store';
import { matrixClient } from '../integrations/matrix-client';
import { readJsonBody } from '../middleware/validate';
import { getAuthUser, requireUser } from '../middleware/require-user';

const coalition = new Hono();

const feedQuerySchema = z.object({
    canopyId: z.string().optional(),
    denId: z.string().optional(),
    kind: z.enum(['video', 'event', 'aid', 'listing', 'proposal']).optional(),
    model: z.enum(['coalition_social_v1', 'recency_only', 'importance_only']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

coalition.get('/feed', (c) => {
    const parsed = feedQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
        return c.json(
            {
                code: 'invalid_request',
                message: 'Invalid feed query',
                details: { issues: parsed.error.issues.map((i) => i.message) },
            },
            400
        );
    }
    const { canopyId, denId, kind, model, limit } = parsed.data;
    const items = listFeedItems({ canopyId, denId, kind });
    const ranked = rankCoalitionFeed(items, { model });
    return c.json({
        generatedAt: new Date().toISOString(),
        items: limit ? ranked.slice(0, limit) : ranked,
    });
});

// --- feed engagement (likes + comments on feed items, surfaced on video) ---

/** Active like count + whether the viewer currently likes the item. */
function likeState(
    feedItemId: string,
    userId: string | undefined
): { count: number; likedByMe: boolean } {
    const likes = listFeedLikes(feedItemId);
    return {
        count: countActive(likes),
        likedByMe: userId ? likes.some((l) => l.userId === userId && l.active) : false,
    };
}

coalition.get('/feed/:id/likes', (c) => {
    // Reads are public (the feed itself is public); `likedByMe` is false when signed out.
    const user = getAuthUser(c);
    const id = c.req.param('id');
    if (!getFeedItem(id)) {
        return c.json({ code: 'not_found', message: 'Feed item not found' }, 404);
    }
    return c.json(likeState(id, user?.sub));
});

const likeSchema = z.object({ active: z.boolean() });

coalition.post('/feed/:id/likes', async (c) => {
    const user = requireUser(c, 'Sign in to like a video');
    if (user instanceof Response) return user;
    const id = c.req.param('id');
    if (!getFeedItem(id)) {
        return c.json({ code: 'not_found', message: 'Feed item not found' }, 404);
    }
    const parsed = await readJsonBody(c, likeSchema);
    if (parsed instanceof Response) return parsed;
    saveFeedLike({ id: newFeedLikeId(), feedItemId: id, userId: user.sub, active: parsed.active });
    return c.json(likeState(id, user.sub));
});

coalition.get('/feed/:id/comments', (c) => {
    // Reads are public (the feed itself is public).
    const id = c.req.param('id');
    if (!getFeedItem(id)) {
        return c.json({ code: 'not_found', message: 'Feed item not found' }, 404);
    }
    return c.json({ comments: listFeedComments(id) });
});

const commentSchema = z.object({ body: z.string().min(1).max(2000) });

coalition.post('/feed/:id/comments', async (c) => {
    const user = requireUser(c, 'Sign in to comment');
    if (user instanceof Response) return user;
    const id = c.req.param('id');
    if (!getFeedItem(id)) {
        return c.json({ code: 'not_found', message: 'Feed item not found' }, 404);
    }
    const parsed = await readJsonBody(c, commentSchema);
    if (parsed instanceof Response) return parsed;
    const comment = createFeedComment({
        id: newFeedCommentId(),
        feedItemId: id,
        authorId: user.sub,
        body: parsed.body,
    });
    return c.json({ comment }, 201);
});

const spatialQuerySchema = z.object({
    layers: z.string().optional(),
    canopyId: z.string().optional(),
});

coalition.get('/spatial-feed', (c) => {
    const parsed = spatialQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
        return c.json({ code: 'invalid_request', message: 'Invalid spatial query' }, 400);
    }
    const layers = parsed.data.layers ? parsed.data.layers.split(',') : undefined;
    const items = listSpatialItems({ layers, canopyId: parsed.data.canopyId });
    return c.json({
        generatedAt: new Date().toISOString(),
        layers: SPATIAL_LAYER_KEYS,
        items,
    });
});

const nearbyQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(20_000).optional(),
});

/** Returns the viewer coordinates + radius (m) when a full nearby filter is supplied. */
function parseNearby(c: {
    req: { query: (key: string) => string | undefined };
}): { viewer: { latitude: number; longitude: number }; radiusMeters: number } | null {
    const parsed = nearbyQuerySchema.safeParse({
        lat: c.req.query('lat'),
        lng: c.req.query('lng'),
        radiusKm: c.req.query('radiusKm'),
    });
    if (!parsed.success) return null;
    const { lat, lng, radiusKm } = parsed.data;
    if (lat === undefined || lng === undefined || radiusKm === undefined) return null;
    return { viewer: { latitude: lat, longitude: lng }, radiusMeters: radiusKm * 1000 };
}

coalition.get('/mutual-aid', (c) => {
    const denId = c.req.query('denId');
    let posts = listAidPosts({ denId });
    const nearby = parseNearby(c);
    if (nearby) {
        posts = posts.filter((post) =>
            isWithinRadiusMeters(post.location, nearby.viewer, nearby.radiusMeters)
        );
    }
    return c.json({ posts });
});

const createAidSchema = z.object({
    type: z.enum(AID_POST_TYPES),
    category: z.enum(AID_POST_CATEGORIES),
    title: z.string().min(1).max(140),
    description: z.string().min(1).max(2000),
    location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        address: z.string().optional(),
    }),
    displayRadiusMeters: z.number().int().min(50).max(50_000).default(400),
    urgency: z.enum(AID_POST_URGENCY).default('medium'),
    expiresAt: z.string().datetime().optional(),
    denId: z.string().optional(),
});

coalition.post('/mutual-aid', async (c) => {
    const user = requireUser(c, 'Sign in to post mutual aid');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createAidSchema);
    if (parsed instanceof Response) return parsed;
    const post = createAidPost({
        id: newAidId(),
        customerId: user.sub,
        type: parsed.type,
        category: parsed.category,
        title: parsed.title,
        description: parsed.description,
        location: parsed.location,
        displayRadiusMeters: parsed.displayRadiusMeters,
        urgency: parsed.urgency,
        expiresAt: parsed.expiresAt,
        denId: parsed.denId,
        status: 'open',
    });
    return c.json({ post }, 201);
});

coalition.get('/seller-locations', (c) => {
    const onlyVisible = c.req.query('onlyVisible') !== 'false';
    let locations = listSellerLocations({ onlyVisible });
    const nearby = parseNearby(c);
    if (nearby) {
        locations = locations.filter((location) =>
            isWithinRadiusMeters(location.coordinates, nearby.viewer, nearby.radiusMeters)
        );
    }
    return c.json({ locations });
});

coalition.get('/tasks', (c) => {
    const denId = c.req.query('denId');
    return c.json({ tasks: listTasks({ denId }) });
});

const createTaskSchema = z.object({
    denId: z.string().min(1),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    assigneeId: z.string().optional(),
    proposalEventId: z.string().optional(),
});

coalition.post('/tasks', async (c) => {
    const user = requireUser(c, 'Sign in to create a task');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createTaskSchema);
    if (parsed instanceof Response) return parsed;
    const task = createTask({
        id: newTaskId(),
        denId: parsed.denId,
        title: parsed.title,
        description: parsed.description,
        assigneeId: parsed.assigneeId,
        proposalEventId: parsed.proposalEventId,
    });
    return c.json({ task }, 201);
});

const updateTaskSchema = z.object({
    status: z.enum(TASK_STATUSES),
});

coalition.patch('/tasks/:id', async (c) => {
    const user = requireUser(c, 'Sign in to update a task');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, updateTaskSchema);
    if (parsed instanceof Response) return parsed;
    const task = updateTaskStatus(c.req.param('id'), parsed.status);
    if (!task) {
        return c.json({ code: 'not_found', message: 'Task not found' }, 404);
    }
    return c.json({ task });
});

// --- Coalition Needs Board ---

coalition.get('/needs', (c) => {
    const canopyId = c.req.query('canopyId');
    return c.json({ needs: listNeeds({ canopyId }) });
});

const createNeedSchema = z.object({
    canopyId: z.string().min(1),
    kind: z.string().min(1).max(64),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
});

coalition.post('/needs', async (c) => {
    const user = requireUser(c, 'Sign in to post a need');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createNeedSchema);
    if (parsed instanceof Response) return parsed;
    const need = createNeed({
        id: newNeedId(),
        canopyId: parsed.canopyId,
        kind: parsed.kind,
        title: parsed.title,
        description: parsed.description,
        authorId: user.sub,
    });
    return c.json({ need }, 201);
});

const updateNeedSchema = z.object({
    status: z.enum(NEED_STATUSES).optional(),
    fulfilledByListingId: z.string().max(256).optional(),
});

coalition.patch('/needs/:id', async (c) => {
    const user = requireUser(c, 'Sign in to update a need');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, updateNeedSchema);
    if (parsed instanceof Response) return parsed;
    const need = updateNeed(c.req.param('id'), parsed);
    if (!need) {
        return c.json({ code: 'not_found', message: 'Need not found' }, 404);
    }
    return c.json({ need });
});

// --- Coalition projects ---

coalition.get('/projects', (c) => {
    const canopyId = c.req.query('canopyId');
    const nowMs = Date.now();
    // Decorate each project-backed entry with its live Momentum so callers can
    // rank surging + near-completion projects up (the prosocial "Heat").
    const projects = listProjects({ canopyId }).map((project) => ({
        ...project,
        momentum: projectMomentum(project.id, nowMs),
    }));
    return c.json({ projects });
});

const milestoneInputSchema = z.object({
    id: z.string().min(1).max(64).optional(),
    label: z.string().min(1).max(200),
    thresholdCents: z.number().int().min(0),
});

const fundingFields = {
    fundingGoalCents: z.number().int().min(0).optional(),
    currency: z.string().min(3).max(8).optional(),
    useOfFunds: z.string().max(2000).optional(),
    deadlineAt: z.string().datetime().optional(),
    milestones: z.array(milestoneInputSchema).max(20).optional(),
};

const createProjectSchema = z.object({
    canopyId: z.string().min(1),
    title: z.string().min(1).max(200),
    category: z.string().min(1).max(64),
    description: z.string().max(2000).optional(),
    proposalEventId: z.string().optional(),
    ...fundingFields,
});

function withMilestoneIds(
    milestones: Array<{ id?: string; label: string; thresholdCents: number }> | undefined
) {
    if (!milestones) return undefined;
    return milestones.map((m) => ({
        id: m.id ?? `ms_${Math.random().toString(36).slice(2, 10)}`,
        label: m.label,
        thresholdCents: m.thresholdCents,
    }));
}

coalition.post('/projects', async (c) => {
    const user = requireUser(c, 'Sign in to launch a project');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createProjectSchema);
    if (parsed instanceof Response) return parsed;
    const project = createProject({
        id: newProjectId(),
        canopyId: parsed.canopyId,
        title: parsed.title,
        category: parsed.category,
        description: parsed.description,
        leadId: user.sub,
        proposalEventId: parsed.proposalEventId,
        fundingGoalCents: parsed.fundingGoalCents,
        currency: parsed.currency,
        useOfFunds: parsed.useOfFunds,
        deadlineAt: parsed.deadlineAt,
        milestones: withMilestoneIds(parsed.milestones),
    });
    return c.json({ project }, 201);
});

// Full project view: progress, Momentum, endowed-progress framing, supporter wall.
coalition.get('/projects/:id', (c) => {
    const view = getProjectView(c.req.param('id'));
    if (!view) {
        return c.json({ code: 'not_found', message: 'Project not found' }, 404);
    }
    return c.json(view);
});

coalition.get('/projects/:id/supporters', (c) => {
    if (!getProject(c.req.param('id'))) {
        return c.json({ code: 'not_found', message: 'Project not found' }, 404);
    }
    const limit = Math.min(Number(c.req.query('limit') ?? '50') || 50, 200);
    return c.json({ supporters: listProjectSupporters(c.req.param('id'), { limit }) });
});

const updateProjectSchema = z
    .object({
        status: z.enum(PROJECT_STATUSES).optional(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        category: z.string().min(1).max(64).optional(),
        ...fundingFields,
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

coalition.patch('/projects/:id', async (c) => {
    const user = requireUser(c, 'Sign in to update a project');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, updateProjectSchema);
    if (parsed instanceof Response) return parsed;

    const existing = getProject(c.req.param('id'));
    if (!existing) {
        return c.json({ code: 'not_found', message: 'Project not found' }, 404);
    }
    // Only the project lead may edit it — the builder owns their journey.
    if (existing.leadId !== user.sub) {
        return c.json({ code: 'forbidden', message: 'Only the project lead can edit it' }, 403);
    }

    const { status, milestones, ...rest } = parsed;
    let project = existing;
    const fundingPatch = {
        ...rest,
        ...(milestones ? { milestones: withMilestoneIds(milestones) } : {}),
    };
    if (Object.keys(fundingPatch).length > 0) {
        project = updateProject(existing.id, fundingPatch) ?? project;
    }
    if (status) {
        project = updateProjectStatus(existing.id, status) ?? project;
    }
    return c.json({ project });
});

const supportProjectSchema = z.object({
    grossCents: z.number().int().min(TIP_LIMITS.minCents).max(TIP_LIMITS.maxCents),
    currency: z.string().min(3).max(8),
    note: z.string().max(TIP_LIMITS.maxNoteLength).optional(),
});

// Support a project: records a tip toward it. Money capture flows through the
// existing FBM pipeline; on capture the project's progress bar advances.
coalition.post('/projects/:id/support', async (c) => {
    const user = requireUser(c, 'Sign in to support a project');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, supportProjectSchema);
    if (parsed instanceof Response) return parsed;

    const project = getProject(c.req.param('id'));
    if (!project) {
        return c.json({ code: 'not_found', message: 'Project not found' }, 404);
    }
    try {
        const tip = createTip({
            senderUserId: user.sub,
            recipientUserId: project.leadId,
            contextKind: 'coalition_project',
            contextRef: project.id,
            grossCents: parsed.grossCents,
            currency: parsed.currency,
            note: parsed.note,
        });
        return c.json({ tip }, 201);
    } catch (error) {
        if (error instanceof TipValidationError) {
            const status: 400 | 404 | 409 =
                error.code === 'recipient_unknown'
                    ? 404
                    : error.code === 'duplicate_order'
                    ? 409
                    : 400;
            return c.json({ code: error.code, message: error.message }, status);
        }
        throw error;
    }
});

// --- Coalition Resource Registry ---

coalition.get('/resources', (c) => {
    const canopyId = c.req.query('canopyId');
    return c.json({ resources: listResources({ canopyId }) });
});

const createResourceSchema = z.object({
    canopyId: z.string().min(1),
    name: z.string().min(1).max(200),
    kind: z.string().min(1).max(64),
    description: z.string().max(2000).optional(),
    availability: z.enum(RESOURCE_AVAILABILITY).optional(),
    location: z.string().max(256).optional(),
});

coalition.post('/resources', async (c) => {
    const user = requireUser(c, 'Sign in to register a resource');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createResourceSchema);
    if (parsed instanceof Response) return parsed;
    const resource = createResource({
        id: newResourceId(),
        canopyId: parsed.canopyId,
        name: parsed.name,
        kind: parsed.kind,
        description: parsed.description,
        availability: parsed.availability,
        stewardId: user.sub,
        location: parsed.location,
    });
    return c.json({ resource }, 201);
});

const updateResourceSchema = z.object({
    availability: z.enum(RESOURCE_AVAILABILITY),
});

coalition.patch('/resources/:id', async (c) => {
    const user = requireUser(c, 'Sign in to update a resource');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, updateResourceSchema);
    if (parsed instanceof Response) return parsed;
    const resource = updateResourceAvailability(c.req.param('id'), parsed.availability);
    if (!resource) {
        return c.json({ code: 'not_found', message: 'Resource not found' }, 404);
    }
    return c.json({ resource });
});

// --- Coalition events (gatherings) ---

const DAY_MS = 1000 * 60 * 60 * 24;

coalition.get('/events', (c) => {
    const denId = c.req.query('denId');
    const now = Date.now();
    const events = listEvents({ denId }).map((event) => ({
        ...event,
        rsvpSummary: rsvpSummaryFor(event.id),
        nextOccurrence: nextOccurrence(event, now),
    }));
    return c.json({ events });
});

coalition.get('/events/:id', (c) => {
    const event = getEvent(c.req.param('id'));
    if (!event) {
        return c.json({ code: 'not_found', message: 'Event not found' }, 404);
    }
    const now = Date.now();
    // Anchor the horizon on the event's own start so far-future / recurring
    // events still surface their upcoming occurrences.
    const horizon = Math.max(now, Date.parse(event.startsAt)) + DAY_MS * 365;
    const occurrences = expandOccurrences(event, now - DAY_MS, horizon, now).slice(0, 50);
    return c.json({
        event,
        rsvpSummary: rsvpSummaryFor(event.id),
        rsvps: listEventRsvps(event.id),
        occurrences,
    });
});

const recurrenceSchema = z.object({
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    interval: z.number().int().min(1).max(365),
    until: z.string().datetime().optional(),
    count: z.number().int().min(1).max(366).optional(),
});

const eventLocationSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().max(280).optional(),
});

const createEventSchema = z.object({
    title: z.string().min(1).max(140),
    description: z.string().min(1).max(2000),
    location: eventLocationSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
    category: z.enum(EVENT_CATEGORIES),
    visibility: z.enum(EVENT_VISIBILITY).default('public'),
    denId: z.string().optional(),
    capacity: z.number().int().min(1).max(1_000_000).optional(),
    recurrence: recurrenceSchema.optional(),
});

coalition.post('/events', async (c) => {
    const user = requireUser(c, 'Sign in to create an event');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createEventSchema);
    if (parsed instanceof Response) return parsed;
    const event = saveEvent({
        id: newEventId(),
        organizerId: user.sub,
        title: parsed.title,
        description: parsed.description,
        location: parsed.location,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        category: parsed.category,
        visibility: parsed.visibility,
        status: 'scheduled',
        denId: parsed.denId,
        capacity: parsed.capacity,
        recurrence: parsed.recurrence,
    });
    return c.json({ event }, 201);
});

const updateEventSchema = z.object({
    title: z.string().min(1).max(140).optional(),
    description: z.string().min(1).max(2000).optional(),
    location: eventLocationSchema.optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    status: z.enum(EVENT_LIFECYCLE_STATUSES).optional(),
    denId: z.string().nullable().optional(),
    capacity: z.number().int().min(1).max(1_000_000).nullable().optional(),
    recurrence: recurrenceSchema.nullable().optional(),
});

coalition.patch('/events/:id', async (c) => {
    const user = requireUser(c, 'Sign in to edit an event');
    if (user instanceof Response) return user;
    const existing = getEvent(c.req.param('id'));
    if (!existing) {
        return c.json({ code: 'not_found', message: 'Event not found' }, 404);
    }
    if (existing.organizerId !== user.sub) {
        return c.json(
            { code: 'forbidden', message: 'Only the organizer can edit this event' },
            403
        );
    }
    const parsed = await readJsonBody(c, updateEventSchema);
    if (parsed instanceof Response) return parsed;
    // Apply the patch: undefined = leave as-is, null = clear an optional field.
    const next = { ...existing } as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
        if (value === undefined) continue;
        if (value === null) delete next[key];
        else next[key] = value;
    }
    const event = saveEvent(next as Parameters<typeof saveEvent>[0]);
    return c.json({ event });
});

const rsvpSchema = z.object({ status: z.enum(RSVP_STATUSES) });

coalition.post('/events/:id/rsvp', async (c) => {
    const user = requireUser(c, 'Sign in to RSVP');
    if (user instanceof Response) return user;
    const event = getEvent(c.req.param('id'));
    if (!event) {
        return c.json({ code: 'not_found', message: 'Event not found' }, 404);
    }
    const parsed = await readJsonBody(c, rsvpSchema);
    if (parsed instanceof Response) return parsed;
    const rsvp = saveRsvp({
        id: newRsvpId(),
        eventId: event.id,
        userId: user.sub,
        status: parsed.status,
    });
    return c.json({ rsvp, rsvpSummary: rsvpSummaryFor(event.id) });
});

// Provision an "after-event den" — a persistent Matrix room attached to the
// event so attendees keep organizing once it ends.
coalition.post('/events/:id/den', async (c) => {
    const user = requireUser(c, 'Sign in to create a den');
    if (user instanceof Response) return user;
    const event = getEvent(c.req.param('id'));
    if (!event) {
        return c.json({ code: 'not_found', message: 'Event not found' }, 404);
    }
    if (event.organizerId !== user.sub) {
        return c.json({ code: 'forbidden', message: 'Only the organizer can create the den' }, 403);
    }
    if (event.denId) {
        return c.json({ denId: event.denId, created: false });
    }
    const result = await matrixClient.createRoom({
        name: event.title,
        topic: `Coalition event den: ${event.title}`,
        preset: 'public_chat',
        visibility: event.visibility === 'public' ? 'public' : 'private',
    });
    if (!result.ok) {
        return c.json(
            { code: 'matrix_unavailable', message: 'Could not create den', reason: result.reason },
            502
        );
    }
    const updated = saveEvent({ ...event, denId: result.roomId });
    return c.json({ denId: result.roomId, event: updated, created: true }, 201);
});

// --- event volunteer slots ---

const createSlotSchema = z.object({
    role: z.string().min(1).max(120),
    capacity: z.number().int().min(1).max(10_000),
});

coalition.post('/events/:id/volunteer-slots', async (c) => {
    const user = requireUser(c, 'Sign in to add a volunteer slot');
    if (user instanceof Response) return user;
    const event = getEvent(c.req.param('id'));
    if (!event) return c.json({ code: 'not_found', message: 'Event not found' }, 404);
    if (event.organizerId !== user.sub) {
        return c.json({ code: 'forbidden', message: 'Only the organizer can add slots' }, 403);
    }
    const parsed = await readJsonBody(c, createSlotSchema);
    if (parsed instanceof Response) return parsed;
    const slot = saveVolunteerSlot({
        id: newSlotId(),
        eventId: event.id,
        role: parsed.role,
        capacity: parsed.capacity,
        status: 'open',
    });
    return c.json({ slot }, 201);
});

coalition.get('/events/:id/volunteer-slots', (c) => {
    const eventId = c.req.param('id');
    const signups = listVolunteerSignups(eventId);
    const slots = listVolunteerSlots(eventId)
        .filter((slot) => slot.status === 'open')
        .map((slot) => {
            const filled = countActive(signups.filter((s) => s.slotId === slot.id));
            return { ...slot, filled, remaining: slotRemaining(slot, filled) };
        });
    return c.json({ slots });
});

coalition.post('/events/:id/volunteer-slots/:slotId/signup', async (c) => {
    const user = requireUser(c, 'Sign in to volunteer');
    if (user instanceof Response) return user;
    const eventId = c.req.param('id');
    const slot = getVolunteerSlot(c.req.param('slotId'));
    if (!slot || slot.eventId !== eventId) {
        return c.json({ code: 'not_found', message: 'Volunteer slot not found' }, 404);
    }
    const othersActive = countActive(
        listVolunteerSignups(eventId).filter((s) => s.slotId === slot.id && s.userId !== user.sub)
    );
    if (othersActive >= slot.capacity) {
        return c.json({ code: 'slot_full', message: 'This slot is full' }, 409);
    }
    const signup = saveVolunteerSignup({
        id: newSignupId(),
        slotId: slot.id,
        eventId,
        userId: user.sub,
        active: true,
    });
    return c.json({ signup });
});

coalition.post('/events/:id/volunteer-slots/:slotId/withdraw', async (c) => {
    const user = requireUser(c, 'Sign in to withdraw');
    if (user instanceof Response) return user;
    const eventId = c.req.param('id');
    const slot = getVolunteerSlot(c.req.param('slotId'));
    if (!slot || slot.eventId !== eventId) {
        return c.json({ code: 'not_found', message: 'Volunteer slot not found' }, 404);
    }
    const signup = saveVolunteerSignup({
        id: newSignupId(),
        slotId: slot.id,
        eventId,
        userId: user.sub,
        active: false,
    });
    return c.json({ signup });
});

// --- event ride coordination ---

const createRideSchema = z.object({
    originLabel: z.string().min(1).max(200),
    departAt: z.string().datetime().optional(),
    seatsTotal: z.number().int().min(1).max(50),
    notes: z.string().max(500).optional(),
});

coalition.post('/events/:id/rides', async (c) => {
    const user = requireUser(c, 'Sign in to offer a ride');
    if (user instanceof Response) return user;
    const event = getEvent(c.req.param('id'));
    if (!event) return c.json({ code: 'not_found', message: 'Event not found' }, 404);
    const parsed = await readJsonBody(c, createRideSchema);
    if (parsed instanceof Response) return parsed;
    const offer = saveRideOffer({
        id: newRideOfferId(),
        eventId: event.id,
        driverId: user.sub,
        originLabel: parsed.originLabel,
        departAt: parsed.departAt,
        seatsTotal: parsed.seatsTotal,
        notes: parsed.notes,
        status: 'open',
    });
    return c.json({ offer }, 201);
});

coalition.get('/events/:id/rides', (c) => {
    const eventId = c.req.param('id');
    const claims = listRideClaims(eventId);
    const offers = listRideOffers(eventId)
        .filter((offer) => offer.status === 'open')
        .map((offer) => {
            const claimed = countActive(claims.filter((cl) => cl.offerId === offer.id));
            return { ...offer, claimed, seatsRemaining: seatsRemaining(offer, claimed) };
        });
    return c.json({ offers });
});

coalition.post('/events/:id/rides/:offerId/claim', async (c) => {
    const user = requireUser(c, 'Sign in to claim a seat');
    if (user instanceof Response) return user;
    const eventId = c.req.param('id');
    const offer = getRideOffer(c.req.param('offerId'));
    if (!offer || offer.eventId !== eventId) {
        return c.json({ code: 'not_found', message: 'Ride offer not found' }, 404);
    }
    const othersActive = countActive(
        listRideClaims(eventId).filter((cl) => cl.offerId === offer.id && cl.riderId !== user.sub)
    );
    if (othersActive >= offer.seatsTotal) {
        return c.json({ code: 'ride_full', message: 'No seats remaining' }, 409);
    }
    const claim = saveRideClaim({
        id: newRideClaimId(),
        offerId: offer.id,
        eventId,
        riderId: user.sub,
        active: true,
    });
    return c.json({ claim });
});

coalition.post('/events/:id/rides/:offerId/release', async (c) => {
    const user = requireUser(c, 'Sign in to release a seat');
    if (user instanceof Response) return user;
    const eventId = c.req.param('id');
    const offer = getRideOffer(c.req.param('offerId'));
    if (!offer || offer.eventId !== eventId) {
        return c.json({ code: 'not_found', message: 'Ride offer not found' }, 404);
    }
    const claim = saveRideClaim({
        id: newRideClaimId(),
        offerId: offer.id,
        eventId,
        riderId: user.sub,
        active: false,
    });
    return c.json({ claim });
});

// --- Coalition rings (trusted circles/crews/guilds) ---

const memberCountFor = (ringId: string): number => countActiveMembers(listRingMemberships(ringId));

const ringLocationSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().max(280).optional(),
});

const createRingSchema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).default(''),
    kind: z.enum(RING_KINDS).default('circle'),
    visibility: z.enum(RING_VISIBILITY).default('public'),
    location: ringLocationSchema.optional(),
    denId: z.string().optional(),
});

coalition.get('/rings', (c) => {
    const memberId = c.req.query('memberId');
    const memberships = listRingMemberships();
    let rings = listRings();
    if (memberId) {
        // A user's rings (for profile display) — exclude private rings of others.
        const ringIds = new Set(
            memberships.filter((m) => m.userId === memberId && m.active).map((m) => m.ringId)
        );
        rings = rings.filter((r) => ringIds.has(r.id) && r.visibility !== 'private');
    } else {
        rings = rings.filter((r) => r.visibility === 'public');
    }
    const result = rings.map((ring) => ({
        ...ring,
        memberCount: countActiveMembers(memberships.filter((m) => m.ringId === ring.id)),
    }));
    return c.json({ rings: result });
});

coalition.post('/rings', async (c) => {
    const user = requireUser(c, 'Sign in to create a ring');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createRingSchema);
    if (parsed instanceof Response) return parsed;
    const ring = saveRing({
        id: newRingId(),
        name: parsed.name,
        description: parsed.description,
        kind: parsed.kind,
        visibility: parsed.visibility,
        ownerId: user.sub,
        location: parsed.location,
        denId: parsed.denId,
    });
    // The creator is the founding owner.
    saveRingMembership({
        id: newMembershipId(),
        ringId: ring.id,
        userId: user.sub,
        role: 'owner',
        active: true,
    });
    return c.json({ ring, memberCount: 1 }, 201);
});

coalition.get('/rings/:id', (c) => {
    const user = requireUser(c, 'Sign in to view a ring');
    if (user instanceof Response) return user;
    const ring = getRing(c.req.param('id'));
    if (!ring) return c.json({ code: 'not_found', message: 'Ring not found' }, 404);
    const members = listRingMemberships(ring.id).filter((m) => m.active);
    return c.json({
        ring,
        memberCount: members.length,
        members: members.map((m) => ({ userId: m.userId, role: m.role })),
    });
});

coalition.post('/rings/:id/join', async (c) => {
    const user = requireUser(c, 'Sign in to join a ring');
    if (user instanceof Response) return user;
    const ring = getRing(c.req.param('id'));
    if (!ring) return c.json({ code: 'not_found', message: 'Ring not found' }, 404);
    if (ring.visibility === 'private') {
        return c.json({ code: 'invite_only', message: 'This ring is invite-only' }, 403);
    }
    const existing = listRingMemberships(ring.id).find((m) => m.userId === user.sub);
    const membership = saveRingMembership({
        id: existing?.id ?? newMembershipId(),
        ringId: ring.id,
        userId: user.sub,
        role: existing?.role ?? 'member',
        active: true,
    });
    return c.json({ membership, memberCount: memberCountFor(ring.id) });
});

coalition.post('/rings/:id/leave', async (c) => {
    const user = requireUser(c, 'Sign in to leave a ring');
    if (user instanceof Response) return user;
    const ring = getRing(c.req.param('id'));
    if (!ring) return c.json({ code: 'not_found', message: 'Ring not found' }, 404);
    const existing = listRingMemberships(ring.id).find((m) => m.userId === user.sub);
    const membership = saveRingMembership({
        id: existing?.id ?? newMembershipId(),
        ringId: ring.id,
        userId: user.sub,
        role: existing?.role ?? 'member',
        active: false,
    });
    return c.json({ membership, memberCount: memberCountFor(ring.id) });
});

const updateMemberSchema = z.object({ role: z.enum(RING_ROLES) });

coalition.patch('/rings/:id/members/:userId', async (c) => {
    const user = requireUser(c, 'Sign in to manage members');
    if (user instanceof Response) return user;
    const ring = getRing(c.req.param('id'));
    if (!ring) return c.json({ code: 'not_found', message: 'Ring not found' }, 404);
    const memberships = listRingMemberships(ring.id);
    if (!canManageRing(memberships, user.sub)) {
        return c.json({ code: 'forbidden', message: 'Only owners/admins can manage members' }, 403);
    }
    const parsed = await readJsonBody(c, updateMemberSchema);
    if (parsed instanceof Response) return parsed;
    const targetId = c.req.param('userId');
    const target = memberships.find((m) => m.userId === targetId && m.active);
    if (!target) {
        return c.json({ code: 'not_found', message: 'Member not found' }, 404);
    }
    const membership = saveRingMembership({
        id: target.id,
        ringId: ring.id,
        userId: targetId,
        role: parsed.role,
        active: true,
    });
    return c.json({ membership });
});

// --- ring invitations (the path into private rings) ---

coalition.get('/rings/invites/mine', (c) => {
    const user = requireUser(c, 'Sign in to view invitations');
    if (user instanceof Response) return user;
    const invitations = listRingInvitations({ inviteeId: user.sub }).filter(
        (inv) => inv.status === 'pending'
    );
    return c.json({ invitations });
});

const inviteSchema = z.object({ inviteeId: z.string().min(1).max(255) });

coalition.post('/rings/:id/invites', async (c) => {
    const user = requireUser(c, 'Sign in to invite members');
    if (user instanceof Response) return user;
    const ring = getRing(c.req.param('id'));
    if (!ring) return c.json({ code: 'not_found', message: 'Ring not found' }, 404);
    if (!canManageRing(listRingMemberships(ring.id), user.sub)) {
        return c.json({ code: 'forbidden', message: 'Only owners/admins can invite' }, 403);
    }
    const parsed = await readJsonBody(c, inviteSchema);
    if (parsed instanceof Response) return parsed;
    const invitation = saveRingInvitation({
        id: newRingInvitationId(),
        ringId: ring.id,
        inviterId: user.sub,
        inviteeId: parsed.inviteeId,
        status: 'pending',
    });
    return c.json({ invitation }, 201);
});

coalition.get('/rings/:id/invites', (c) => {
    const user = requireUser(c, 'Sign in to view invitations');
    if (user instanceof Response) return user;
    const ring = getRing(c.req.param('id'));
    if (!ring) return c.json({ code: 'not_found', message: 'Ring not found' }, 404);
    if (!canManageRing(listRingMemberships(ring.id), user.sub)) {
        return c.json(
            { code: 'forbidden', message: 'Only owners/admins can view invitations' },
            403
        );
    }
    return c.json({ invitations: listRingInvitations({ ringId: ring.id }) });
});

coalition.post('/rings/:id/invites/accept', async (c) => {
    const user = requireUser(c, 'Sign in to accept an invitation');
    if (user instanceof Response) return user;
    const ringId = c.req.param('id');
    const invite = listRingInvitations({ ringId, inviteeId: user.sub }).find(
        (inv) => inv.status === 'pending'
    );
    if (!invite) {
        return c.json({ code: 'not_found', message: 'No pending invitation' }, 404);
    }
    saveRingInvitation({ ...invite, status: 'accepted' });
    const membership = saveRingMembership({
        id: newMembershipId(),
        ringId,
        userId: user.sub,
        role: 'member',
        active: true,
    });
    return c.json({ membership, memberCount: memberCountFor(ringId) });
});

coalition.post('/rings/:id/invites/decline', async (c) => {
    const user = requireUser(c, 'Sign in to decline an invitation');
    if (user instanceof Response) return user;
    const ringId = c.req.param('id');
    const invite = listRingInvitations({ ringId, inviteeId: user.sub }).find(
        (inv) => inv.status === 'pending'
    );
    if (!invite) {
        return c.json({ code: 'not_found', message: 'No pending invitation' }, 404);
    }
    const invitation = saveRingInvitation({ ...invite, status: 'declined' });
    return c.json({ invitation });
});

// --- Coalition kits (preconfigured community setup packs) ---

coalition.get('/kits', (c) => {
    return c.json({ kits: KIT_DEFINITIONS });
});

coalition.get('/kits/applied', (c) => {
    const scopeType = c.req.query('scopeType');
    const scopeId = c.req.query('scopeId');
    return c.json({ applications: listKitApplications({ scopeType, scopeId }) });
});

const applyKitSchema = z.object({
    scopeType: z.enum(INSTALL_SCOPE_TYPES),
    scopeId: z.string().min(1),
});

coalition.post('/kits/:id/apply', async (c) => {
    const user = requireUser(c, 'Sign in to apply a kit');
    if (user instanceof Response) return user;
    const kit = getKit(c.req.param('id'));
    if (!kit) return c.json({ code: 'not_found', message: 'Kit not found' }, 404);
    const parsed = await readJsonBody(c, applyKitSchema);
    if (parsed instanceof Response) return parsed;

    const scope = { type: parsed.scopeType, id: parsed.scopeId };
    const reputationTier = db.getUserById(user.sub)?.reputationTier ?? 'member';
    const scopeAuth = authorizeScope(user.sub, reputationTier, scope);
    if (!scopeAuth.ok) {
        return c.json({ code: scopeAuth.code, message: scopeAuth.message }, 403);
    }

    // Install each bundled (free, in-tree) plugin at the target scope.
    const installations = kit.plugins.map((plugin) =>
        installPluginAtScope({
            pluginId: plugin.pluginId,
            scope,
            installedByUserId: user.sub,
            entitlementId: null,
            artifactKind: plugin.artifactKind,
            domain: plugin.domain,
            manifest: { id: plugin.pluginId, name: kit.name, kit: kit.id, free: true },
        })
    );

    const application = recordKitApplication({
        id: newKitApplicationId(),
        kitId: kit.id,
        scopeType: parsed.scopeType,
        scopeId: parsed.scopeId,
        appliedByUserId: user.sub,
    });

    return c.json({ kit, enabledTabs: kit.enabledTabs, installations, application }, 201);
});

// Lightweight authed username search, used by the ring-invite picker to
// resolve a Blackout user id for an invitee.
coalition.get('/user-search', (c) => {
    const user = requireUser(c, 'Sign in to search members');
    if (user instanceof Response) return user;
    const q = c.req.query('q') ?? '';
    return c.json({ users: db.searchUsers(q, 10) });
});

export default coalition;
