import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_ROOTS } from '@blackout/contracts';
import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import governanceRoutes from './routes/governance';
import federationRoutes from './routes/federation';
import channelRoutes from './routes/channels';
import { authMiddleware } from './middleware/auth';
import { rateLimit } from './middleware/rate-limit';
import { recordLegacyApiAliasUsage, startLegacyApiAliasWeeklyReporter } from './telemetry/api-alias-usage';

const app = new Hono();
const API_ALIAS_REMOVAL_DATE = '2026-08-31';
const legacyAliasEnabled = new Date() < new Date(`${API_ALIAS_REMOVAL_DATE}T00:00:00.000Z`);

app.use('*', cors());
app.use('*', rateLimit);
app.use(`${API_ROOTS.v1}/*`, authMiddleware);

if (legacyAliasEnabled) {
  app.use(`${API_ROOTS.legacyApiAlias}/*`, authMiddleware);
  app.use(`${API_ROOTS.legacyApiAlias}/*`, async (c, next) => {
    recordLegacyApiAliasUsage(c.req.path);

    await next();
    c.header('Deprecation', 'true');
    c.header('Sunset', API_ALIAS_REMOVAL_DATE);
    c.header('Link', '</docs/api/versioning.md>; rel="deprecation"; type="text/markdown"');
    console.warn(`[api] deprecated namespace used: ${c.req.method} ${c.req.path}`);
  });

  startLegacyApiAliasWeeklyReporter();
}

for (const root of legacyAliasEnabled ? [API_ROOTS.v1, API_ROOTS.legacyApiAlias] : [API_ROOTS.v1]) {
  app.route(`${root}/auth`, authRoutes);
  app.route(`${root}/messages`, messageRoutes);
  app.route(`${root}/governance`, governanceRoutes);
  app.route(`${root}/federation`, federationRoutes);
  app.route(`${root}/channels`, channelRoutes);
}

app.get('/health', (c) => c.json({ status: 'ok', legacyAliasEnabled, aliasRemovalDate: API_ALIAS_REMOVAL_DATE }));

export default app;
