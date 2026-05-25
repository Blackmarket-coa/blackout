import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_ROOTS } from '@blackout/contracts';
import { isOriginAllowed, readCorsRuntimeConfig } from './config/cors';
import authRoutes from './routes/auth';
import invitationRoutes from './routes/invitations';
import followRoutes from './routes/follows';
import shareRoutes from './routes/sharePreview';
import messageRoutes from './routes/messages';
import scheduledMessageRoutes from './routes/scheduledMessages';
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
import patreonWebhookRoutes from './routes/patreonWebhook';
import streamlabsRoutes from './routes/streamlabs';
import youtubeChatBridgeRoutes from './routes/youtubeChatBridges';
import integrationsHealthRoutes from './routes/integrationsHealth';
import simulcastRoutes from './routes/simulcastDestinations';
import kickChatBridgeRoutes from './routes/kickChatBridges';
import tenorRoutes from './routes/tenor';
import {
  authedRouter as discordCompatWebhookRoutes,
  publicExecuteRouter as discordCompatWebhookExecuteRoutes,
} from './routes/discordCompatWebhooks';
import outboundEventWebhookRoutes from './routes/outboundEventWebhooks';
import twitchIrcBotTokenRoutes from './routes/twitchIrcBotTokens';
import obsWsPasswordRoutes from './routes/obsWsPasswords';
import rtmpFanoutRoutes from './routes/rtmpFanout';
import matrixAppserviceRoutes from './routes/matrixAppservice';
import matrixRoutes from './routes/matrix';
import coalitionRoutes from './routes/coalition';
import coliseumRoutes from './routes/coliseum';
import reputationRoutes from './routes/reputation';
import webauthnRoutes from './routes/webauthn';
import keyTransparencyRoutes from './routes/keyTransparency';
import diagnosticsRoutes from './routes/diagnostics';
import adminRoutes from './routes/admin';
import bugReportRoutes from './routes/bugReport';
import widgetReportRoutes from './routes/widgetReport';
import { authMiddleware } from './middleware/auth';
import { rateLimit } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security-headers';
import { recordLegacyApiAliasUsage, startLegacyApiAliasWeeklyReporter } from './telemetry/api-alias-usage';
import { log } from './telemetry/logger';
import { httpMetricsMiddleware } from './telemetry/http-metrics';
import { registry as metricsRegistry } from './telemetry/metrics';
import { initErrorReporter } from './telemetry/errors';
import { initTracing } from './telemetry/tracing';
import { bootstrapMailer } from './services/mailer';
import { runSecurityPreflight } from './config/security';
import { initMailerFromEnv } from './services/mailer';
import { registerFeatureModules } from './modules';
import { drainRuntimeStore, initRuntimeStore, RUNTIME_DB_MODE } from './db/store';
import { migrateUp, MIGRATIONS_DIR } from './db/migrate';
import { getSharedPgPool } from './config/postgres';

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
  app.route(`${root}/admin`, adminRoutes);
  app.route(`${root}/invitations`, invitationRoutes);
  app.route(`${root}/follows`, followRoutes);
  // Share-link OG preview, also under /v1 so it's reachable on hosts whose
  // nginx only proxies /v1/* to the API (the top-level /i mount below needs a
  // dedicated nginx rule). Public via the pass-through auth middleware.
  app.route(`${root}/i`, shareRoutes);
  app.route(`${root}/matrix`, matrixRoutes);
  app.route(`${root}/messages`, messageRoutes);
  app.route(`${root}/scheduled-messages`, scheduledMessageRoutes);
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
  app.route(`${root}/integrations/patreon/webhook`, patreonWebhookRoutes);
  app.route(`${root}/integrations/streamlabs`, streamlabsRoutes);
  app.route(`${root}/integrations/youtube/chat-bridges`, youtubeChatBridgeRoutes);
  app.route(`${root}/integrations/health`, integrationsHealthRoutes);
  app.route(`${root}/integrations/simulcast/destinations`, simulcastRoutes);
  app.route(`${root}/integrations/kick/chat-bridges`, kickChatBridgeRoutes);
  app.route(`${root}/integrations/tenor`, tenorRoutes);
  app.route(`${root}/integrations/discord-compat/webhooks`, discordCompatWebhookRoutes);
  app.route(`${root}/integrations/outbound-webhooks`, outboundEventWebhookRoutes);
  app.route(`${root}/integrations/twitch-compat/bot-tokens`, twitchIrcBotTokenRoutes);
  app.route(`${root}/integrations/obs-ws/passwords`, obsWsPasswordRoutes);
  app.route(`${root}/integrations/simulcast/fanout`, rtmpFanoutRoutes);
  app.route(`${root}/coalition`, coalitionRoutes);
  app.route(`${root}/coliseum`, coliseumRoutes);
  app.route(`${root}/reputation`, reputationRoutes);
  app.route(`${root}/auth/webauthn`, webauthnRoutes);
  app.route(`${root}/key-transparency`, keyTransparencyRoutes);
  app.route(`${root}/diagnostics`, diagnosticsRoutes);
  registerFeatureModules(app, root);
}

// Discord-wire-compatible webhook execute endpoint. Mounted top-level (outside
// /v1) so it has a stable URL the user can paste into 3rd-party services that
// expect a Discord webhook URL. Auth is the URL token; no Bearer.
app.route('/discord-compat/webhooks', discordCompatWebhookExecuteRoutes);

// Matrix appservice transactions endpoint. Mounted at the spec-mandated
// `/_matrix/app/v1/...` path; auth is the homeserver token configured in
// MATRIX_APPSERVICE_HS_TOKEN. Synapse PUTs event batches here on every
// room transaction we're registered to receive.
app.route('/_matrix/app/v1', matrixAppserviceRoutes);

// User-facing bug report intake. Mounted top-level (outside /v1) so
// anonymous reports work without the v1 auth middleware. Validates with
// zod, rate-limited at BUG_REPORT_RATE_LIMIT_MAX/hour/IP, dual-forwards
// to a rageshake-compatible receiver (raw logs) and GitHub (sanitized
// issue body).
app.route('/bug-report', bugReportRoutes);

// Global report-widget intake (web + native). Mounted top-level alongside
// /bug-report so anonymous reports work without the v1 auth middleware.
// Rate-limited at BUG_REPORT_RATE_LIMIT_MAX/hour/IP; posts a formatted report
// into the #bugs Matrix room as the bot, with attachment + triage thread +
// status reaction.
app.route('/bug-report/widget', widgetReportRoutes);

// Public Open Graph share-preview landing for invite/personal links. Mounted
// top-level (outside /v1) so social crawlers can fetch it without auth; it
// returns OG meta tags and redirects humans into the SPA `/invite/:token` flow.
app.route('/i', shareRoutes);

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

// Postgres runtime store: run migrations then hydrate the in-memory mirror
// BEFORE serving or starting any store-reading background loops. Top-level
// await pauses module evaluation until the store is ready. Skipped under test
// (shouldListen=false) and in memory/file modes.
if (shouldListen && RUNTIME_DB_MODE === 'postgres') {
  const pool = await getSharedPgPool();
  if (process.env.BLACKOUT_DB_MIGRATE_ON_START !== '0') {
    const applied = await migrateUp({ pool, migrationsDir: MIGRATIONS_DIR });
    log.info('db_migrations_applied_on_start', { count: applied.length });
  }
  await initRuntimeStore(pool);
  log.info('postgres_store_hydrated');

  const drainOnExit = (signal: string) => {
    void (async () => {
      try {
        await drainRuntimeStore();
        log.info('postgres_store_drained', { signal });
      } catch (err) {
        log.warn('postgres_store_drain_failed', { error: String(err) });
      } finally {
        process.exit(0);
      }
    })();
  };
  process.once('SIGTERM', () => drainOnExit('SIGTERM'));
  process.once('SIGINT', () => drainOnExit('SIGINT'));
}

if (shouldListen) {
  // Fire-and-forget: optional tracing + error reporting. Both fall back to a
  // noop transport when their env knobs are unset, so this is safe even in
  // bare-bones deployments.
  initTracing().catch((err) => log.warn('tracing init failed', { error: String(err) }));
  initErrorReporter().catch((err) => log.warn('error reporter init failed', { error: String(err) }));
  bootstrapMailer();

  // Resolve the outbound mail transport. Production refuses to start
  // without an explicit MAIL_PROVIDER (see services/mailer.ts), so this
  // throw will surface in the process supervisor.
  initMailerFromEnv().catch((err) => {
    log.warn('mailer init failed', { error: String(err) });
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
  });

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

  // Periodic idle-detection on chat-ingress sockets. A session that has
  // gone silent past HEALTH_IDLE_THRESHOLD_MS (twice Twitch's PING
  // interval) is force-closed; the close handler reconnects it with a
  // fresh OAuth token. Same env-gating as the resume hook so unit-test
  // environments don't spawn a background timer they didn't ask for.
  if (process.env.BLACKOUT_RESUME_TWITCH_BRIDGES === '1') {
    void import('./integrations/twitch/chatIngress').then(({ startHealthCheckLoop }) => {
      startHealthCheckLoop();
      log.info('twitch_chat_ingress_health_check_loop_started');
    });
  }

  // Streamlabs donation poller. Walks every linked Streamlabs account on
  // the configured interval and syncs new donations into the widget bus,
  // so a creator's overlay fires within minutes of a real donation
  // landing on Streamlabs — without them having to click "Sync donations
  // now" themselves. Env var also accepts a custom interval in seconds
  // for tighter / looser cadence.
  // YouTube Live chat poller. Walks every active YouTube chat bridge and
  // pulls new messages from /liveChat/messages, forwarding each into the
  // bridge's Matrix room. Same env-gating pattern as the Streamlabs
  // sync — opt-in so test environments don't get a surprise timer.
  if (process.env.BLACKOUT_YOUTUBE_CHAT_AUTOSYNC === '1') {
    const intervalSeconds = Number.parseInt(
      process.env.BLACKOUT_YOUTUBE_CHAT_AUTOSYNC_INTERVAL_SECONDS ?? '',
      10,
    );
    const intervalMs = Number.isFinite(intervalSeconds) && intervalSeconds > 0
      ? intervalSeconds * 1000
      : undefined;
    void import('./services/youtubeChatBridgeScheduler').then(
      ({ startYoutubeChatScheduler }) => {
        startYoutubeChatScheduler(intervalMs);
        log.info('youtube_chat_scheduler_started', { intervalMs });
      },
    );
  }

  if (process.env.BLACKOUT_STREAMLABS_AUTOSYNC === '1') {
    const intervalSeconds = Number.parseInt(
      process.env.BLACKOUT_STREAMLABS_AUTOSYNC_INTERVAL_SECONDS ?? '',
      10,
    );
    const intervalMs = Number.isFinite(intervalSeconds) && intervalSeconds > 0
      ? intervalSeconds * 1000
      : undefined;
    void import('./services/streamlabsDonationScheduler').then(({ startStreamlabsScheduler }) => {
      startStreamlabsScheduler(intervalMs);
      log.info('streamlabs_donation_scheduler_started', { intervalMs });
    });
  }

  // Scheduled-message dispatcher. Delivers messages whose deliverAt has
  // passed into their Matrix room, so a scheduled send fires even when the
  // author's client is closed. On by default (it backs a first-party
  // feature, not an optional integration); set
  // BLACKOUT_SCHEDULED_MESSAGES_DISPATCH=0 to disable, or
  // BLACKOUT_SCHEDULED_MESSAGES_DISPATCH_INTERVAL_SECONDS for a custom cadence.
  if (process.env.BLACKOUT_SCHEDULED_MESSAGES_DISPATCH !== '0') {
    const intervalSeconds = Number.parseInt(
      process.env.BLACKOUT_SCHEDULED_MESSAGES_DISPATCH_INTERVAL_SECONDS ?? '',
      10,
    );
    const intervalMs =
      Number.isFinite(intervalSeconds) && intervalSeconds > 0
        ? intervalSeconds * 1000
        : undefined;
    void import('./services/scheduledMessageDispatcher').then(
      ({ startScheduledMessageDispatcher }) => {
        startScheduledMessageDispatcher(intervalMs);
        log.info('scheduled_message_dispatcher_started', { intervalMs });
      },
    );
  }

  const httpServer = serve({ fetch: app.fetch, port: PORT }, (info) => {
    log.info('blackout-server listening', { port: info.port });
  });

  // Twitch-IRC-compatible bot shim. External chat bots (Nightbot etc.)
  // upgrade to ws on /twitch-irc, authenticate with the bot tokens minted
  // at /v1/integrations/twitch-compat/bot-tokens, and run unmodified.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void import('./integrations/twitch-compat/ircServer').then(({ attachTwitchIrcShim }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attachTwitchIrcShim(httpServer as any);
    log.info('twitch_irc_shim_attached', { path: '/twitch-irc' });
  });

  // OBS-WebSocket v5 compatibility shim. External control surfaces
  // (Bitfocus Companion, Stream Deck, Touch Portal) upgrade to ws on
  // /obs-ws/<password-id>, complete the OBS-WS challenge/response auth,
  // and issue OBS-WS requests we dispatch via the protocol layer's
  // request matrix.
  void import('./integrations/obs-ws-compat/server').then(({ attachObsWsShim }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attachObsWsShim(httpServer as any);
    log.info('obs_ws_shim_attached', { pathPrefix: '/obs-ws/' });
  });

  // StreamElements OverlayWS-compatible socket.io shim. Off-the-shelf
  // SE browser-source overlay HTML connects to /se-overlay/, emits
  // `authenticate` with a widgetAlertToken, and receives the same
  // alerts as the SSE feed at /v1/widget-alerts/stream — but in the
  // SE-shaped `event` frame so existing SE overlay HTML works
  // unmodified.
  void import('./integrations/se-overlay-compat/server').then(({ attachSeOverlayShim }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attachSeOverlayShim(httpServer as any);
    log.info('se_overlay_shim_attached', { path: '/se-overlay/' });
  });
}

export default app;
