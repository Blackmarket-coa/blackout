import { log } from './telemetry/logger';

/**
 * Start the API's periodic background-job loops: Twitch bridge resume +
 * chat-ingress idle sweep, the YouTube / Streamlabs pollers, the
 * scheduled-message dispatcher, and the FBM → Matrix sweepers + ACL reconcile
 * loop.
 *
 * Each loop keeps its own env gate (most are opt-in; the scheduled-message
 * dispatcher is on by default), so this is safe to call unconditionally.
 *
 * In a single-process deployment the API node runs these in-process (see
 * src/index.ts, gated on BLACKOUT_BACKGROUND_WORKERS_DISABLED). When a
 * dedicated `worker` process owns them (src/worker.ts), the API + canary
 * replicas set BLACKOUT_BACKGROUND_WORKERS_DISABLED=1 so jobs are not
 * double-processed across replicas.
 */
export function startBackgroundLoops(): void {
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
            10
        );
        const intervalMs =
            Number.isFinite(intervalSeconds) && intervalSeconds > 0
                ? intervalSeconds * 1000
                : undefined;
        void import('./services/youtubeChatBridgeScheduler').then(
            ({ startYoutubeChatScheduler }) => {
                startYoutubeChatScheduler(intervalMs);
                log.info('youtube_chat_scheduler_started', { intervalMs });
            }
        );
    }

    if (process.env.BLACKOUT_STREAMLABS_AUTOSYNC === '1') {
        const intervalSeconds = Number.parseInt(
            process.env.BLACKOUT_STREAMLABS_AUTOSYNC_INTERVAL_SECONDS ?? '',
            10
        );
        const intervalMs =
            Number.isFinite(intervalSeconds) && intervalSeconds > 0
                ? intervalSeconds * 1000
                : undefined;
        void import('./services/streamlabsDonationScheduler').then(
            ({ startStreamlabsScheduler }) => {
                startStreamlabsScheduler(intervalMs);
                log.info('streamlabs_donation_scheduler_started', { intervalMs });
            }
        );
    }

    // Owncast concurrent-viewer snapshots → analytics warehouse. Polls the
    // origin's public /api/status; feeds the Creator Hub insights time series.
    // Opt-in (needs both an Owncast origin and CLICKHOUSE_URL to be useful).
    if (process.env.BLACKOUT_OWNCAST_METRICS === '1') {
        const intervalSeconds = Number.parseInt(
            process.env.BLACKOUT_OWNCAST_METRICS_INTERVAL_SECONDS ?? '',
            10
        );
        const intervalMs =
            Number.isFinite(intervalSeconds) && intervalSeconds > 0
                ? intervalSeconds * 1000
                : undefined;
        void import('./services/owncastMetricsScheduler').then(
            ({ startOwncastMetricsScheduler }) => {
                startOwncastMetricsScheduler(intervalMs);
                log.info('owncast_metrics_scheduler_started', { intervalMs });
            }
        );
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
            10
        );
        const intervalMs =
            Number.isFinite(intervalSeconds) && intervalSeconds > 0
                ? intervalSeconds * 1000
                : undefined;
        void import('./services/scheduledMessageDispatcher').then(
            ({ startScheduledMessageDispatcher }) => {
                startScheduledMessageDispatcher(intervalMs);
                log.info('scheduled_message_dispatcher_started', { intervalMs });
            }
        );

        // Scheduled creator-content publisher. Flips scheduled video/article/guide
        // posts to published (and surfaces them on the Home feed) once their
        // scheduledFor passes. Shares the scheduled-messages enable/cadence env so
        // operators toggle first-party scheduling in one place.
        void import('./services/scheduledContentDispatcher').then(
            ({ startScheduledContentDispatcher }) => {
                startScheduledContentDispatcher(intervalMs);
                log.info('scheduled_content_dispatcher_started', { intervalMs });
            }
        );
    }

    // Coalition Surge detector. Periodically compares each project's 24h support
    // windows; opens a Surge when support spikes (notifying contributors) and
    // expires surges past their 24–48h window. Opt-in so test/dev environments
    // don't spawn a surprise timer; interval configurable in seconds.
    if (process.env.BLACKOUT_COALITION_SURGE_ENABLED === '1') {
        const intervalSeconds = Number.parseInt(
            process.env.BLACKOUT_COALITION_SURGE_INTERVAL_SECONDS ?? '',
            10
        );
        const intervalMs =
            Number.isFinite(intervalSeconds) && intervalSeconds > 0
                ? intervalSeconds * 1000
                : undefined;
        void import('./services/coalitionSurgeScheduler').then(
            ({ startCoalitionSurgeScheduler }) => {
                startCoalitionSurgeScheduler(intervalMs);
                log.info('coalition_surge_scheduler_started', { intervalMs });
            }
        );
    }

    // Dead-man's-switch autonomous sweep. Fires switches whose check-in window
    // has lapsed even when the owner is gone — the whole point of the feature —
    // by evaluating every armed switch server-side on a timer. On by default
    // (it backs a first-party safety feature); set BLACKOUT_DEADMAN_SWEEP=0 to
    // disable, or BLACKOUT_DEADMAN_SWEEP_INTERVAL_SECONDS for a custom cadence.
    if (process.env.BLACKOUT_DEADMAN_SWEEP !== '0') {
        const intervalSeconds = Number.parseInt(
            process.env.BLACKOUT_DEADMAN_SWEEP_INTERVAL_SECONDS ?? '',
            10
        );
        const intervalMs =
            Number.isFinite(intervalSeconds) && intervalSeconds > 0
                ? intervalSeconds * 1000
                : undefined;
        void import('./services/deadmanSweepScheduler').then(({ startDeadmanSweepScheduler }) => {
            startDeadmanSweepScheduler(intervalMs);
            log.info('deadman_sweep_scheduler_started', { intervalMs });
        });
    }

    // FBM → Matrix bridge tombstone sweeper. Purges expired digital-product
    // dead-drop rooms (72h / on download) and resolved dispute rooms past their
    // retention window (90d). Only runs when the bridge is enabled.
    if (
        process.env.FBM_MATRIX_BRIDGE_ENABLED === '1' ||
        process.env.FBM_MATRIX_BRIDGE_ENABLED?.toLowerCase() === 'true'
    ) {
        void import('./services/fbmMatrixBridge/tombstoneDispatcher').then(
            ({ startFbmTombstoneDispatcher }) => {
                startFbmTombstoneDispatcher();
                log.info('fbm_matrix_tombstone_dispatcher_started', {});
            }
        );
        // Flash-mob ephemeral spatial-pin sweeper (§6): purge expired heat pins so
        // location data never outlives the operational window (§8.3).
        void import('./services/fbmMatrixBridge/flashMobDispatcher').then(
            ({ startFlashMobPinSweeper }) => {
                startFlashMobPinSweeper();
                log.info('fbm_flash_mob_pin_sweeper_started', {});
            }
        );
    }

    // FBM entitlements → Matrix ACL drift-correction reconcile loop. Re-asserts
    // power levels for every MXID the ACL sync worker has touched. Only runs when
    // ACL sync is enabled.
    if (
        process.env.FBM_ACL_SYNC_ENABLED === '1' ||
        process.env.FBM_ACL_SYNC_ENABLED?.toLowerCase() === 'true'
    ) {
        void import('./services/fbmAclSync/dispatcher').then(({ startFbmAclReconcileLoop }) => {
            startFbmAclReconcileLoop();
            log.info('fbm_acl_reconcile_loop_started', {});
        });
    }
}
