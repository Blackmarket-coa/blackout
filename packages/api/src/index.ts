import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_ROOTS } from '@blackout/contracts';
import { isOriginAllowed, readCorsRuntimeConfig } from './config/cors';
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
import giftRoutes from './routes/gifts';
import communityBoostRoutes from './routes/communityBoosts';
import roleRoutes from './routes/roles';
import channelAccessRoutes from './routes/channelAccess';
import aidPoolRoutes from './routes/aidPools';
import adRevenueRoutes from './routes/adRevenue';
import appRoutes from './routes/apps';
import linkedAccountRoutes from './routes/linkedAccounts';
import twitchChatBridgeRoutes from './routes/twitchChatBridges';
import twitchEventSubRoutes from './routes/twitchEventSub';
import widgetAlertRoutes from './routes/widgetAlerts';
import coalitionRoutes from './routes/coalition';
import coliseumRoutes from './routes/coliseum';
import webauthnRoutes from './routes/webauthn';
import keyTransparencyRoutes from './routes/keyTransparency';
import { authMiddleware } from './middleware/auth';
import { rateLimit } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security-headers';
import { recordLegacyApiAliasUsage, startLegacyApiAliasWeeklyReporter } from './telemetry/api-alias-usage';
import { log } from './telemetry/logger';
import { httpMetricsMiddleware } from './telemetry/http-metrics';
import { registry as metricsRegistry } from './telemetry/metrics';
import { initErrorReporter } from './telemetry/errors';
import { initTracing } from './telemetry/tracing';
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

const corsConfig = readCorsRuntimeConfig();
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return null;
      return isOriginAllowed(origin, corsConfig) ? origin : null;
    },
    credentials: corsConfig.credentials,
    allowMethods: corsConfig.allowedMethods,
    allowHeaders: corsConfig.allowedHeaders,
    exposeHeaders: corsConfig.exposeHeaders,
    maxAge: corsConfig.maxAge,
  }),
);
app.use('*', httpMetricsMiddleware);
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
  app.route(`${root}/gifts`, giftRoutes);
  app.route(`${root}/community-boosts`, communityBoostRoutes);
  app.route(`${root}/roles`, roleRoutes);
  app.route(`${root}/channel-access`, channelAccessRoutes);
  app.route(`${root}/aid-pools`, aidPoolRoutes);
  app.route(`${root}/ad-revenue`, adRevenueRoutes);
  app.route(`${root}/apps`, appRoutes);
  app.route(`${root}/linked-accounts`, linkedAccountRoutes);
  app.route(`${root}/integrations/twitch/chat-bridges`, twitchChatBridgeRoutes);
  app.route(`${root}/integrations/twitch/eventsub`, twitchEventSubRoutes);
  app.route(`${root}/integrations/widgets/alerts`, widgetAlertRoutes);
  app.route(`${root}/coalition`, coalitionRoutes);
  app.route(`${root}/coliseum`, coliseumRoutes);
  app.route(`${root}/auth/webauthn`, webauthnRoutes);
  app.route(`${root}/key-transparency`, keyTransparencyRoutes);
  registerFeatureModules(app, root);
}

app.get('/health', (c) => c.json({ status: 'ok', legacyAliasEnabled, aliasRemovalDate: API_ALIAS_REMOVAL_DATE, security: securityPreflight }));

app.get('/metrics', (c) => {
  // Token-gated to keep cardinality and PII surface internal. Either set
  // INTERNAL_METRICS_TOKEN to a long random value and configure Prometheus to
  // send it as Authorization: Bearer <token>, or run the scraper on the
  // private network and leave the token unset (no auth, dev only).
  const expected = process.env.INTERNAL_METRICS_TOKEN;
  if (expected) {
    const presented = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (presented !== expected) {
      return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
    }
  } else if (process.env.NODE_ENV === 'production') {
    return c.json(
      { code: 'metrics_token_missing', message: 'INTERNAL_METRICS_TOKEN must be set in production.' },
      503,
    );
  }
  c.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
  return c.body(metricsRegistry.expose());
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const shouldListen = process.env.NODE_ENV !== 'test' && process.env.BLACKOUT_API_SKIP_LISTEN !== '1';

if (shouldListen) {
  // Fire-and-forget: optional tracing + error reporting. Both fall back to a
  // noop transport when their env knobs are unset, so this is safe even in
  // bare-bones deployments.
  initTracing().catch((err) => log.warn('tracing init failed', { error: String(err) }));
  initErrorReporter().catch((err) => log.warn('error reporter init failed', { error: String(err) }));

  // Resume any persisted Twitch chat bridges so they survive a redeploy.
  // Gated on an opt-in env var so the auto-restart doesn't surprise local
  // dev / staging environments that share a DB with prod-shaped data.
  if (process.env.BLACKOUT_RESUME_TWITCH_BRIDGES === '1') {
    void import('./services/twitchChatBridge').then(async ({ resumeAllBridges }) => {
      try {
        const result = await resumeAllBridges();
        log.info('twitch_chat_bridges_resumed', result);
      } catch (err) {
        log.warn('twitch_chat_bridges_resume_failed', { error: String(err) });
      }
    });
  }

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    log.info('blackout-server listening', { port: info.port });
  });
}

export default app;
