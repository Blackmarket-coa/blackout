import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import {
    PluginSocialError,
    createShowcase,
    listForks,
    listReviews,
    listShowcasesForScope,
    pluginSocialEnabled,
    ratingFor,
    recordFork,
    submitReview,
} from '../services/pluginSocial';

const pluginSocial = new Hono();

pluginSocial.use('*', async (c, next) => {
    if (!pluginSocialEnabled()) {
        return c.json({ code: 'feature_disabled', message: 'Plugin social is not enabled.' }, 404);
    }
    await next();
});

pluginSocial.get('/reviews/:pluginId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const pluginId = c.req.param('pluginId');
    return c.json({ reviews: listReviews(pluginId), rating: ratingFor(pluginId) });
});

pluginSocial.post('/reviews/:pluginId', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const pluginId = c.req.param('pluginId');
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
        const review = submitReview({
            pluginId,
            userId: user.sub,
            rating: typeof body.rating === 'number' ? body.rating : NaN,
            body: typeof body.body === 'string' ? body.body : '',
            providerListingId:
                typeof body.providerListingId === 'string' ? body.providerListingId : null,
        });
        return c.json({ review }, 201);
    } catch (error) {
        if (error instanceof PluginSocialError) {
            return c.json({ code: error.code, message: error.message }, 400);
        }
        throw error;
    }
});

pluginSocial.get('/forks/:pluginId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ forks: listForks(c.req.param('pluginId')) });
});

pluginSocial.post('/forks/:pluginId', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const forkedFromPluginId = c.req.param('pluginId');
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const newPluginId = typeof body.newPluginId === 'string' ? body.newPluginId : '';
    if (!newPluginId) {
        return c.json({ code: 'invalid_fork', message: 'newPluginId is required.' }, 400);
    }
    const fork = recordFork({
        forkedFromPluginId,
        newPluginId,
        ownerUserId: user.sub,
        note: typeof body.note === 'string' ? body.note : '',
    });
    return c.json({ fork }, 201);
});

pluginSocial.get('/showcases', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const scopeType = c.req.query('scopeType');
    const scopeId = c.req.query('scopeId');
    if (!scopeType || !scopeId) {
        return c.json({ code: 'invalid_request', message: 'scopeType and scopeId are required.' }, 400);
    }
    return c.json({ showcases: listShowcasesForScope(scopeType, scopeId) });
});

pluginSocial.post('/showcases', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const pluginId = typeof body.pluginId === 'string' ? body.pluginId : '';
    const scopeType = typeof body.scopeType === 'string' ? body.scopeType : '';
    const scopeId = typeof body.scopeId === 'string' ? body.scopeId : '';
    const title = typeof body.title === 'string' ? body.title : '';
    if (!pluginId || !scopeType || !scopeId) {
        return c.json({ code: 'invalid_showcase', message: 'pluginId, scopeType, scopeId are required.' }, 400);
    }
    try {
        const showcase = createShowcase({
            pluginId,
            userId: user.sub,
            scopeType,
            scopeId,
            title,
            body: typeof body.body === 'string' ? body.body : '',
        });
        return c.json({ showcase }, 201);
    } catch (error) {
        if (error instanceof PluginSocialError) {
            return c.json({ code: error.code, message: error.message }, 400);
        }
        throw error;
    }
});

export default pluginSocial;
