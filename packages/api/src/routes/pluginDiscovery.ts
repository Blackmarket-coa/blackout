import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { discoverPlugins, pluginDiscoveryEnabled } from '../services/pluginDiscovery';

const pluginDiscovery = new Hono();

pluginDiscovery.use('*', async (c, next) => {
    if (!pluginDiscoveryEnabled()) {
        return c.json({ code: 'feature_disabled', message: 'Plugin discovery is not enabled.' }, 404);
    }
    await next();
});

pluginDiscovery.get('/', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const surface = c.req.query('surface') ?? undefined;
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    return c.json({
        recommendations: discoverPlugins({
            surface,
            limit: Number.isFinite(limit) ? limit : undefined,
        }),
    });
});

export default pluginDiscovery;
