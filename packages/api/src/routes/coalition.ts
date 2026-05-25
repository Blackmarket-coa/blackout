import { Hono } from 'hono';
import { z } from 'zod';
import {
    AID_POST_CATEGORIES,
    AID_POST_TYPES,
    AID_POST_URGENCY,
    SPATIAL_LAYER_KEYS,
    isWithinRadiusMeters,
    rankCoalitionFeed,
} from '@blackout/core';
import {
    createAidPost,
    listAidPosts,
    listFeedItems,
    listSellerLocations,
    listSpatialItems,
    newAidId,
} from '../services/coalitionStore';
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

export default coalition;
