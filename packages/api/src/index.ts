import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_ROOTS } from '@blackout/contracts';
import { isOriginAllowed, readCorsRuntimeConfig } from './config/cors';
import authRoutes from './routes/auth';
import invitationRoutes from './routes/invitations';
import identityRoutes from './routes/identities';
import mediaRoutes from './routes/media';
import followRoutes from './routes/follows';
import shareRoutes from './routes/sharePreview';
import messageRoutes from './routes/messages';
import scheduledMessageRoutes from './routes/scheduledMessages';
import federationRoutes from './routes/federation';
import entitlementRoutes from './routes/entitlements';
import transparencyRoutes from './routes/transparency';
import activeDefenseRoutes from './routes/activedefense';
import canaryTripwireRoutes from './routes/canaryTripwire';
import meshRoutes from './routes/mesh';
import marketplaceRoutes from './routes/marketplace';
import notificationRoutes from './routes/notifications';
import { assertPlaceholderMarketplacesDisabledForProduction } from './integrations/marketplace';
import threadRoutes from './routes/threads';
import settingsRoutes from './routes/settings';
import capabilityRoutes from './routes/capabilities';
import pluginInstallationRoutes from './routes/pluginInstallations';
import coalitionKitRoutes from './routes/coalitionKitManifests';
import pluginSocialRoutes from './routes/pluginSocial';
import pluginDiscoveryRoutes from './routes/pluginDiscovery';
import creatorRoutes from './routes/creator';
import vaultRoutes from './routes/vault';
import voiceRoutes from './routes/voice';
import subscriptionRoutes from './routes/subscriptions';
import tipRoutes from './routes/tips';
import creatorSubRoutes from './routes/creatorSubs';
import splitContractRoutes from './routes/splitContracts';
import boostEventRoutes from './routes/boostEvents';
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
import giphyRoutes from './routes/giphy';
import {
    authedRouter as discordCompatWebhookRoutes,
    publicExecuteRouter as discordCompatWebhookExecuteRoutes,
} from './routes/discordCompatWebhooks';
import outboundEventWebhookRoutes from './routes/outboundEventWebhooks';
import discordServerImportRoutes from './routes/discordServerImport';
import discordBridgeActivationRoutes from './routes/discordBridgeActivations';
import migrationDashboardRoutes from './routes/migrationDashboard';
import twitchIrcBotTokenRoutes from './routes/twitchIrcBotTokens';
import twitchHelixProxyRoutes from './routes/twitchHelixProxy';
import channelPointsRoutes from './routes/channelPoints';
import twitchExtensionRoutes from './routes/twitchExtensions';
import obsWsPasswordRoutes from './routes/obsWsPasswords';
import rtmpFanoutRoutes from './routes/rtmpFanout';
import matrixAppserviceRoutes from './routes/matrixAppservice';
import matrixRoutes from './routes/matrix';
import coalitionRoutes from './routes/coalition';
import bountyRoutes from './routes/bounties';
import coliseumRoutes from './routes/coliseum';
import reputationRoutes from './routes/reputation';
import webauthnRoutes from './routes/webauthn';
import keyTransparencyRoutes from './routes/keyTransparency';
import diagnosticsRoutes from './routes/diagnostics';
import telemetryRoutes from './routes/telemetry';
import adminRoutes from './routes/admin';
import bugReportRoutes from './routes/bugReport';
import widgetReportRoutes from './routes/widgetReport';
import { authMiddleware } from './middleware/auth';
import { rateLimit } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security-headers';
import {
    recordLegacyApiAliasUsage,
    startLegacyApiAliasWeeklyReporter,
} from './telemetry/api-alias-usage';
import { log } from './telemetry/logger';
import { startBackgroundLoops } from './backgroundLoops';
import { tryBecomeBackgroundLeader, releaseBackgroundLeader } from './services/backgroundLeader';
import { httpMetricsMiddleware } from './telemetry/http-metrics';
import { registry as metricsRegistry } from './telemetry/metrics';
import { initErrorReporter, errorReporter } from './telemetry/errors';
import { initTracing } from './telemetry/tracing';
import { bootstrapMailer } from './services/mailer';
import { runSecurityPreflight } from './config/security';
import { initMailerFromEnv } from './services/mailer';
import { registerFeatureModules } from './modules';
import { matrixClient } from './integrations/matrix-client';
import { drainRuntimeStore, initRuntimeStore, RUNTIME_DB_MODE } from './db/store';
import { migrateUp, MIGRATIONS_DIR } from './db/migrate';
import { getSharedPgPool } from './config/postgres';

const securityPreflight = runSecurityPreflight();

// Snapshot of the Matrix admin dependency, refreshed by the startup preflight
// below. Surfaced in `/health` so a misconfigured homeserver/bot token (which
// would otherwise only fail at invite-redeem time) is visible to readiness
// probes. Stays at `preflight_pending` in test/non-listening modes.
type MatrixHealth = Awaited<ReturnType<typeof matrixClient.adminPreflight>>;
let matrixHealth: MatrixHealth = { configured: false, adminOk: false, reason: 'preflight_pending' };
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
    })
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
    })
);
app.use('*', httpMetricsMiddleware);
app.use('*', rateLimit);

// Public canary tripwire (OSS-manifest G5) — mounted before the /v1 auth gate
// so an unauthorized party who opens a honeypot artifact fires the canary.
app.route('/ct', canaryTripwireRoutes);

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
    app.route(`${root}/identities`, identityRoutes);
    app.route(`${root}/media`, mediaRoutes);
    app.route(`${root}/follows`, followRoutes);
    // Share-link OG preview, also under /v1 so it's reachable on hosts whose
    // nginx only proxies /v1/* to the API (the top-level /i mount below needs a
    // dedicated nginx rule). Public via the pass-through auth middleware.
    app.route(`${root}/i`, shareRoutes);
    app.route(`${root}/matrix`, matrixRoutes);
    app.route(`${root}/messages`, messageRoutes);
    app.route(`${root}/scheduled-messages`, scheduledMessageRoutes);
    app.route(`${root}/federation`, federationRoutes);
    app.route(`${root}/entitlements`, entitlementRoutes);
    app.route(`${root}/transparency`, transparencyRoutes);
    app.route(`${root}/activedefense`, activeDefenseRoutes);
    app.route(`${root}/mesh`, meshRoutes);
    app.route(`${root}/marketplace`, marketplaceRoutes);
    app.route(`${root}/notifications`, notificationRoutes);
    app.route(`${root}/threads`, threadRoutes);
    app.route(`${root}/settings`, settingsRoutes);
    app.route(`${root}/capabilities`, capabilityRoutes);
    app.route(`${root}/plugin-installations`, pluginInstallationRoutes);
    app.route(`${root}/coalition-kit-manifests`, coalitionKitRoutes);
    app.route(`${root}/plugin-social`, pluginSocialRoutes);
    app.route(`${root}/plugin-discovery`, pluginDiscoveryRoutes);
    app.route(`${root}/creator`, creatorRoutes);
    app.route(`${root}/vault`, vaultRoutes);
    app.route(`${root}/voice`, voiceRoutes);
    app.route(`${root}/subscriptions`, subscriptionRoutes);
    app.route(`${root}/tips`, tipRoutes);
    app.route(`${root}/creator-subs`, creatorSubRoutes);
    app.route(`${root}/split-contracts`, splitContractRoutes);
    app.route(`${root}/boost-events`, boostEventRoutes);
    app.route(`${root}/channel-points`, channelPointsRoutes);
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
    app.route(`${root}/integrations/giphy`, giphyRoutes);
    app.route(`${root}/integrations/discord-compat/webhooks`, discordCompatWebhookRoutes);
    app.route(`${root}/integrations/discord/import`, discordServerImportRoutes);
    app.route(`${root}/integrations/discord/bridges`, discordBridgeActivationRoutes);
    app.route(`${root}/integrations/discord/migration`, migrationDashboardRoutes);
    app.route(`${root}/integrations/outbound-webhooks`, outboundEventWebhookRoutes);
    app.route(`${root}/integrations/twitch-compat/bot-tokens`, twitchIrcBotTokenRoutes);
    app.route(`${root}/integrations/twitch/helix-proxy`, twitchHelixProxyRoutes);
    app.route(`${root}/integrations/twitch/extensions`, twitchExtensionRoutes);
    app.route(`${root}/integrations/obs-ws/passwords`, obsWsPasswordRoutes);
    app.route(`${root}/integrations/simulcast/fanout`, rtmpFanoutRoutes);
    app.route(`${root}/coalition`, coalitionRoutes);
    app.route(`${root}/bounties`, bountyRoutes);
    app.route(`${root}/coliseum`, coliseumRoutes);
    app.route(`${root}/reputation`, reputationRoutes);
    app.route(`${root}/auth/webauthn`, webauthnRoutes);
    app.route(`${root}/key-transparency`, keyTransparencyRoutes);
    app.route(`${root}/diagnostics`, diagnosticsRoutes);
    app.route(`${root}/telemetry`, telemetryRoutes);
    // Also reachable under /v1 (and the legacy alias) so the web client works on
    // hosts whose nginx only proxies /v1/* to the API; the top-level mounts below
    // stay for native + backward compat. Mirrors the /i route's dual mount.
    app.route(`${root}/bug-report`, bugReportRoutes);
    app.route(`${root}/bug-report/widget`, widgetReportRoutes);
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

app.get('/health', (c) =>
    // Unauthenticated readiness probe: expose only coarse booleans. The detailed
    // preflight state (JWT secret count, token transport, Matrix bot user id, and
    // upstream error detail) is sensitive and must not leak to anonymous callers.
    // Operational detail lives behind auth (/metrics, /v1/diagnostics).
    c.json({
        status: 'ok',
        legacyAliasEnabled,
        aliasRemovalDate: API_ALIAS_REMOVAL_DATE,
        security: {
            ok:
                securityPreflight.jwtSecretsConfigured > 0 &&
                securityPreflight.cookieSecureValidated,
        },
        matrix: {
            configured: matrixHealth.configured,
            adminOk: matrixHealth.adminOk,
        },
    })
);

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
            {
                code: 'metrics_token_missing',
                message: 'INTERNAL_METRICS_TOKEN must be set in production.',
            },
            503
        );
    }
    c.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return c.body(metricsRegistry.expose());
});

// Central 404 handler: every unmatched route returns the API's JSON error
// contract rather than Hono's default plain-text body.
app.notFound((c) => c.json({ code: 'not_found', message: 'Not found' }, 404));

// Central error handler: unhandled exceptions from any route are reported to the
// error reporter and returned as the API's JSON error contract. The internal
// error message/stack is never sent to the client — only a generic 500 — so a
// route throw cannot leak internals.
app.onError((err, c) => {
    log.error('unhandled_route_error', {
        method: c.req.method,
        path: c.req.path,
        error: err instanceof Error ? err.message : String(err),
    });
    errorReporter().capture(err, { method: c.req.method, path: c.req.path });
    return c.json({ code: 'internal_error', message: 'Internal server error' }, 500);
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '10000', 10);
const shouldListen =
    process.env.NODE_ENV !== 'test' && process.env.BLACKOUT_API_SKIP_LISTEN !== '1';

// Fail-closed production configuration guards. These run before the server
// listens so a misconfigured production deploy is caught by the process
// supervisor rather than silently degrading or leaking.
if (shouldListen && process.env.NODE_ENV === 'production') {
    if (RUNTIME_DB_MODE !== 'postgres') {
        throw new Error(
            `BLACKOUT_DB_MODE=${RUNTIME_DB_MODE} is not permitted in production; ` +
                'set BLACKOUT_DB_MODE=postgres (with DATABASE_URL) for a durable, ' +
                'multi-replica-safe store.'
        );
    }
    if (!process.env.LOG_HASH_SALT) {
        throw new Error(
            'LOG_HASH_SALT must be set in production so pseudonymized identifiers in ' +
                'logs are not reversible via the known default salt.'
        );
    }
}

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
}

if (shouldListen) {
    // Fire-and-forget: optional tracing + error reporting. Both fall back to a
    // noop transport when their env knobs are unset, so this is safe even in
    // bare-bones deployments.
    initTracing().catch((err) => log.warn('tracing init failed', { error: String(err) }));
    initErrorReporter().catch((err) =>
        log.warn('error reporter init failed', { error: String(err) })
    );
    bootstrapMailer();

    // Refuse to boot if a placeholder marketplace (blamazon / mayhem-marketplaze /
    // antin-amazon) is enabled in production. These have no real adapter, so a deploy
    // with `*_ENABLED=true` would silently pretend to be a marketplace. Throwing here
    // surfaces in the process supervisor before the server starts listening.
    assertPlaceholderMarketplacesDisabledForProduction();

    // Probe the Matrix admin dependency once at boot. Invites/redemption need the
    // bot token to hold Synapse admin rights; without this check a misconfigured
    // deploy looks healthy but fails every invite. We log loudly and cache the
    // result for `/health` rather than hard-failing, since some environments run
    // without Matrix on purpose.
    matrixClient
        .adminPreflight()
        .then((result) => {
            matrixHealth = result;
            if (!result.configured) {
                const msg =
                    'matrix_preflight: homeserver/bot token not configured — invites will be unavailable';
                if (process.env.NODE_ENV === 'production') log.warn(msg);
                else log.info(msg);
            } else if (!result.adminOk) {
                log.warn(
                    'matrix_preflight: bot token lacks Synapse admin access — invites will fail at redeem time',
                    {
                        botUserId: result.botUserId,
                        reason: result.reason,
                        detail: result.detail,
                    }
                );
            } else {
                log.info('matrix_preflight: Synapse admin reachable', {
                    botUserId: result.botUserId,
                });
            }
        })
        .catch((err) => {
            matrixHealth = {
                configured: true,
                adminOk: false,
                reason: 'preflight_error',
                detail: String(err),
            };
            log.warn('matrix_preflight: probe threw', { error: String(err) });
        });

    // Resolve the outbound mail transport. Production refuses to start
    // without an explicit MAIL_PROVIDER (see services/mailer.ts), so this
    // throw will surface in the process supervisor.
    initMailerFromEnv().catch((err) => {
        log.warn('mailer init failed', { error: String(err) });
        if (process.env.NODE_ENV === 'production') {
            throw err;
        }
    });

    // Periodic background-job loops (Twitch/YouTube/Streamlabs pollers, the
    // scheduled-message + content dispatchers, coalition surge, FBM sweepers +
    // ACL reconcile, and the dead-man's-switch sweep). These must run on exactly
    // one process. BLACKOUT_BACKGROUND_WORKERS_DISABLED=1 opts a replica out
    // entirely; among the rest, a Postgres advisory-lock leader election ensures
    // only one actually runs the loops even if the env var is misconfigured
    // across replicas (in file/memory mode there is a single process anyway).
    if (process.env.BLACKOUT_BACKGROUND_WORKERS_DISABLED !== '1') {
        void (async () => {
            const isLeader = await tryBecomeBackgroundLeader();
            if (isLeader) {
                startBackgroundLoops();
                log.info('background_loops_started', {});
            } else {
                log.info('background_loops_skipped_not_leader', {});
            }
        })();
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

    // Graceful shutdown for every runtime mode (not just postgres). Stop
    // accepting new connections, let in-flight requests drain, flush the
    // runtime store (a no-op unless BLACKOUT_DB_MODE=postgres), then exit. A
    // hard timeout guarantees the process still exits if a connection hangs.
    let shuttingDown = false;
    const shutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        log.info('shutdown_signal_received', { signal });
        const forceTimer = setTimeout(() => {
            log.warn('shutdown_forced_after_timeout', { signal, timeoutMs: SHUTDOWN_TIMEOUT_MS });
            process.exit(0);
        }, SHUTDOWN_TIMEOUT_MS);
        if (typeof forceTimer.unref === 'function') forceTimer.unref();

        httpServer.close(() => {
            void (async () => {
                try {
                    await releaseBackgroundLeader();
                    await drainRuntimeStore();
                    log.info('runtime_store_drained', { signal });
                } catch (err) {
                    log.warn('runtime_store_drain_failed', { error: String(err) });
                } finally {
                    clearTimeout(forceTimer);
                    process.exit(0);
                }
            })();
        });
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
}

export default app;
