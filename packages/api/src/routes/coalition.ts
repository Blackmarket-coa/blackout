import { Hono } from 'hono';
import { z } from 'zod';
import {
    AID_POST_CATEGORIES,
    AID_POST_TYPES,
    AID_POST_URGENCY,
    EVENT_CATEGORIES,
    EVENT_LIFECYCLE_STATUSES,
    EVENT_VISIBILITY,
    RECURRENCE_FREQUENCIES,
    RSVP_STATUSES,
    SPATIAL_LAYER_KEYS,
    TASK_STATUSES,
    countActive,
    expandOccurrences,
    isWithinRadiusMeters,
    nextOccurrence,
    rankCoalitionFeed,
    seatsRemaining,
    slotRemaining,
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
    listVolunteerSignups,
    listVolunteerSlots,
    newAidId,
    newEventId,
    newRideClaimId,
    newRideOfferId,
    newRsvpId,
    newSignupId,
    newSlotId,
    rsvpSummaryFor,
    saveEvent,
    saveRideClaim,
    saveRideOffer,
    saveRsvp,
    saveVolunteerSignup,
    saveVolunteerSlot,
} from '../services/coalitionStore';
import { createTask, listTasks, newTaskId, updateTaskStatus } from '../services/taskStore';
import { matrixClient } from '../integrations/matrix-client';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';

const coalition = new Hono();

const feedQuerySchema = z.object({
    canopyId: z.string().optional(),
    denId: z.string().optional(),
    kind: z.enum(['video', 'event', 'aid', 'listing', 'proposal']).optional(),
    model: z
        .enum(['coalition_social_v1', 'recency_only', 'importance_only'])
        .optional(),
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
            400,
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
function parseNearby(c: { req: { query: (key: string) => string | undefined } }):
    | { viewer: { latitude: number; longitude: number }; radiusMeters: number }
    | null {
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
            isWithinRadiusMeters(post.location, nearby.viewer, nearby.radiusMeters),
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
            isWithinRadiusMeters(location.coordinates, nearby.viewer, nearby.radiusMeters),
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
        return c.json({ code: 'forbidden', message: 'Only the organizer can edit this event' }, 403);
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
            502,
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
        listVolunteerSignups(eventId).filter((s) => s.slotId === slot.id && s.userId !== user.sub),
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
        listRideClaims(eventId).filter((cl) => cl.offerId === offer.id && cl.riderId !== user.sub),
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

export default coalition;
