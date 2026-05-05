import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_ROOTS } from '@blackout/contracts';
import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import federationRoutes from './routes/federation';
import channelRoutes from './routes/channels';
import entitlementRoutes from './routes/entitlements';
import marketplaceRoutes from './routes/marketplace';
import creatorRoutes from './routes/creator';
import voiceRoutes from './routes/voice';
import subscriptionRoutes from './routes/subscriptions';
import tipRoutes from './routes/tips';
import creatorSubRoutes from './routes/creatorSubs';
import appRoutes from './routes/apps';
import coalitionRoutes from './routes/coalition';
import coliseumRoutes from './routes/coliseum';
import webauthnRoutes from './routes/webauthn';
import keyTransparencyRoutes from './routes/keyTransparency';
import { authMiddleware } from './middleware/auth';
import { rateLimit } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security-headers';
import { recordLegacyApiAliasUsage, startLegacyApiAliasWeeklyReporter } from './telemetry/api-alias-usage';
import { log } from './telemetry/logger';
import { runSecurityPreflight } from './config/security';
import { registerFeatureModules } from './modules';

const securityPreflight = runSecurityPreflight();
const app = new Hono();
const API_ALIAS_REMOVAL_DATE = '2026-08-31';
const legacyAliasEnabled = new Date() < new Date(`${API_ALIAS_REMOVAL_DATE}T00:00:00.000Z`);

const cspConnectExtra = (process.env.CSP_CONNECT_SRC ?? '').split(/\s+/).filter(Boolean);
const cspMediaExtra = (process.env.CSP_MEDIA_SRC ?? '').split(/\s+/).filter(Boolean);

app.use(
  '*',
  securityHeaders({
    connectSrc: cspConnectExtra,
    mediaSrc: cspMediaExtra,
    reportOnly: process.env.CSP_REPORT_ONLY === '1',
    reportUri: process.env.CSP_REPORT_URI,
  }),
);
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
    log.warn('legacy api namespace used', { method: c.req.method, path: c.req.path });
  });

  startLegacyApiAliasWeeklyReporter();
}

for (const root of legacyAliasEnabled ? [API_ROOTS.v1, API_ROOTS.legacyApiAlias] : [API_ROOTS.v1]) {
  app.route(`${root}/auth`, authRoutes);
  app.route(`${root}/messages`, messageRoutes);
  app.route(`${root}/federation`, federationRoutes);
  app.route(`${root}/channels`, channelRoutes);
  app.route(`${root}/entitlements`, entitlementRoutes);
  app.route(`${root}/marketplace`, marketplaceRoutes);
  app.route(`${root}/creator`, creatorRoutes);
  app.route(`${root}/voice`, voiceRoutes);
  app.route(`${root}/subscriptions`, subscriptionRoutes);
  app.route(`${root}/tips`, tipRoutes);
  app.route(`${root}/creator-subs`, creatorSubRoutes);
  app.route(`${root}/apps`, appRoutes);
  app.route(`${root}/coalition`, coalitionRoutes);
  app.route(`${root}/coliseum`, coliseumRoutes);
  app.route(`${root}/auth/webauthn`, webauthnRoutes);
  app.route(`${root}/key-transparency`, keyTransparencyRoutes);
  registerFeatureModules(app, root);
}

app.get('/health', (c) => c.json({ status: 'ok', legacyAliasEnabled, aliasRemovalDate: API_ALIAS_REMOVAL_DATE, security: securityPreflight }));

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const shouldListen = process.env.NODE_ENV !== 'test' && process.env.BLACKOUT_API_SKIP_LISTEN !== '1';

if (shouldListen) {
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    log.info('blackout-server listening', { port: info.port });
  });
}

export default app;
