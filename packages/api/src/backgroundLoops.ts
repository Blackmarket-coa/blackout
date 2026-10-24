import { trackBackgroundTick } from './services/backgroundTicks';
import { log } from './telemetry/logger';

/** What startBackgroundLoops hands back, so a worker can stop what it started. */
export interface BackgroundLoopsHandle {
    /**
     * Settles once every enabled loop's module has loaded and the loop has
     * started, or was skipped because stop() came first.
     */
    ready: Promise<void>;
    /**
     * Stop every loop: no new tick starts after this, and a loop whose module
     * is still loading never starts. Ticks already running are not waited for
     * here; see services/backgroundTicks.ts.
     */
    stop(): void;
}

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
export function startBackgroundLoops(): BackgroundLoopsHandle {
    const stops: Array<() => void> = [];
    const starting: Array<Promise<void>> = [];
    let stopped = false;

    // Start one loop once its module has loaded, unless stop() came first.
    const launch = <M>(load: Promise<M>, start: (loaded: M) => { stop: () => void }): void => {
        starting.push(
            load.then((loaded) => {
                if (stopped) return;
                stops.push(start(loaded).stop);
            })
        );
    };

    // Resume any persisted Twitch chat bridges so they survive a redeploy.
    // Gated on an opt-in env var so the auto-restart doesn't surprise local
    // dev / staging environments that share a DB with prod-shaped data.
    if (process.env.BLACKOUT_RESUME_TWITCH_BRIDGES === '1') {
        launch(import('./services/twitchChatBridge'), ({ resumeAllBridges }) => {
            void trackBackgroundTick(
                resumeAllBridges().then(
                    (result) => log.info('twitch_chat_bridges_resumed', result),
                    (err) => log.warn('twitch_chat_bridges_resume_failed', { error: String(err) })
                )
            );
            // A one-shot. The sessions it opens close with the health check below.
            return { stop: () => undefined };
        });
    }

    // Periodic idle-detection on chat-ingress sockets. A session that has
    // gone silent past HEALTH_IDLE_THRESHOLD_MS (twice Twitch's PING
    // interval) is force-closed; the close handler reconnects it with a
    // fresh OAuth token. Same env-gating as the resume hook so unit-test
    // environments don't spawn a background timer they didn't ask for.
    if (process.env.BLACKOUT_RESUME_TWITCH_BRIDGES === '1') {
        launch(
            import('./integrations/twitch/chatIngress'),
            ({ startHealthCheckLoop, stopAllChatIngress }) => {
                const loop = startHealthCheckLoop();
                log.info('twitch_chat_ingress_health_check_loop_started');
                return {
                    stop: () => {
                        loop.stop();
                        // The open sessions keep forwarding chat: that is work too.
                        stopAllChatIngress();
                    },
                };
            }
        );
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
        launch(import('./services/youtubeChatBridgeScheduler'), ({ startYoutubeChatScheduler }) => {
            const loop = startYoutubeChatScheduler(intervalMs);
            log.info('youtube_chat_scheduler_started', { intervalMs });
            return loop;
        });
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
        launch(import('./services/streamlabsDonationScheduler'), ({ startStreamlabsScheduler }) => {
            const loop = startStreamlabsScheduler(intervalMs);
            log.info('streamlabs_donation_scheduler_started', { intervalMs });
            return loop;
        });
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
        launch(import('./services/owncastMetricsScheduler'), ({ startOwncastMetricsScheduler }) => {
            const loop = startOwncastMetricsScheduler(intervalMs);
            log.info('owncast_metrics_scheduler_started', { intervalMs });
            return loop;
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
            10
        );
        const intervalMs =
            Number.isFinite(intervalSeconds) && intervalSeconds > 0
                ? intervalSeconds * 1000
                : undefined;
        launch(
            import('./services/scheduledMessageDispatcher'),
            ({ startScheduledMessageDispatcher }) => {
                const loop = startScheduledMessageDispatcher(intervalMs);
                log.info('scheduled_message_dispatcher_started', { intervalMs });
                return loop;
            }
        );

        // Scheduled creator-content publisher. Flips scheduled video/article/guide
        // posts to published (and surfaces them on the Home feed) once their
        // scheduledFor passes. Shares the scheduled-messages enable/cadence env so
        // operators toggle first-party scheduling in one place.
        launch(
            import('./services/scheduledContentDispatcher'),
            ({ startScheduledContentDispatcher }) => {
                const loop = startScheduledContentDispatcher(intervalMs);
                log.info('scheduled_content_dispatcher_started', { intervalMs });
                return loop;
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
        launch(import('./services/coalitionSurgeScheduler'), ({ startCoalitionSurgeScheduler }) => {
            const loop = startCoalitionSurgeScheduler(intervalMs);
            log.info('coalition_surge_scheduler_started', { intervalMs });
            return loop;
        });
    }

    // The same reading the service gates use (`1` or `true`, nothing else), so a
    // deployment that sets `true` gets the timers as well as the service paths.
    const flagOn = (value: string | undefined): boolean =>
        value === '1' || value?.toLowerCase() === 'true';

    // Seconds from the environment as a timer delay, clamped to the largest
    // delay Node's timers honour: past 2^31-1 ms a setInterval fires every
    // millisecond rather than never.
    const MAX_TIMER_MS = 2_147_483_647;
    const intervalMsFromEnv = (name: string): number | undefined => {
        const seconds = Number.parseInt(process.env[name] ?? '', 10);
        if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
        return Math.min(seconds * 1000, MAX_TIMER_MS);
    };

    // Automated coalition cross-posting. Announces campaign milestones from a
    // coalition's OWN connected accounts — never a member's. Opt-in on top of
    // the outbound cross-post gate, which must also be on: turning this one on
    // alone posts nothing, because credential custody starts with that gate.
    if (flagOn(process.env.BLACKOUT_COALITION_AUTOPOST_ENABLED)) {
        const intervalMs = intervalMsFromEnv('BLACKOUT_COALITION_AUTOPOST_INTERVAL_SECONDS');
        launch(
            import('./services/coalitionAutoCrosspostScheduler'),
            ({ startCoalitionAutoCrosspostScheduler }) => {
                const loop = startCoalitionAutoCrosspostScheduler(intervalMs);
                log.info('coalition_autopost_scheduler_started', { intervalMs });
                return loop;
            }
        );
    }

    // Reading back what coalition posts got. Engagement counts land unmoderated;
    // replies go through the quarantine. Shares the inbound sync gate, which is
    // also enforced inside the sweep, so this timer cannot become the thing that
    // turns two-way sync on.
    if (flagOn(process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED)) {
        const intervalMs = intervalMsFromEnv('BLACKOUT_COALITION_INBOUND_INTERVAL_SECONDS');
        launch(
            import('./services/coalitionInboundScheduler'),
            ({ startCoalitionInboundScheduler }) => {
                const loop = startCoalitionInboundScheduler(intervalMs);
                log.info('coalition_inbound_scheduler_started', { intervalMs });
                return loop;
            }
        );
    }

    // Retention for quarantined external replies. NOT gated on the inbound
    // sync flag above: that flag decides whether new replies arrive, while the
    // rows already held are owed their retention window whether or not more
    // are coming — switching two-way sync off must not freeze a stranger's
    // words in place. On by default like the dead-man sweep (it discharges an
    // obligation, not a feature); set BLACKOUT_COALITION_EXTERNAL_RETENTION_SWEEP=0
    // to disable, or ..._INTERVAL_SECONDS for a custom cadence.
    if (process.env.BLACKOUT_COALITION_EXTERNAL_RETENTION_SWEEP !== '0') {
        const intervalMs = intervalMsFromEnv(
            'BLACKOUT_COALITION_EXTERNAL_RETENTION_INTERVAL_SECONDS'
        );
        launch(
            import('./services/coalitionExternalRetentionScheduler'),
            ({ startCoalitionExternalRetentionScheduler }) => {
                const loop = startCoalitionExternalRetentionScheduler(intervalMs);
                log.info('coalition_external_retention_scheduler_started', { intervalMs });
                return loop;
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
        launch(import('./services/deadmanSweepScheduler'), ({ startDeadmanSweepScheduler }) => {
            const loop = startDeadmanSweepScheduler(intervalMs);
            log.info('deadman_sweep_scheduler_started', { intervalMs });
            return loop;
        });
    }

    // FBM → Matrix bridge tombstone sweeper. Purges expired digital-product
    // dead-drop rooms (72h / on download) and resolved dispute rooms past their
    // retention window (90d). Only runs when the bridge is enabled.
    if (
        process.env.FBM_MATRIX_BRIDGE_ENABLED === '1' ||
        process.env.FBM_MATRIX_BRIDGE_ENABLED?.toLowerCase() === 'true'
    ) {
        launch(
            import('./services/fbmMatrixBridge/tombstoneDispatcher'),
            ({ startFbmTombstoneDispatcher }) => {
                const loop = startFbmTombstoneDispatcher();
                log.info('fbm_matrix_tombstone_dispatcher_started', {});
                return loop;
            }
        );
        // Flash-mob ephemeral spatial-pin sweeper (§6): purge expired heat pins so
        // location data never outlives the operational window (§8.3).
        launch(
            import('./services/fbmMatrixBridge/flashMobDispatcher'),
            ({ startFlashMobPinSweeper }) => {
                const loop = startFlashMobPinSweeper();
                log.info('fbm_flash_mob_pin_sweeper_started', {});
                return loop;
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
        launch(import('./services/fbmAclSync/dispatcher'), ({ startFbmAclReconcileLoop }) => {
            const loop = startFbmAclReconcileLoop();
            log.info('fbm_acl_reconcile_loop_started', {});
            return loop;
        });
    }

    return {
        ready: Promise.all(starting).then(() => undefined),
        stop: () => {
            stopped = true;
            for (const stopLoop of stops.splice(0)) stopLoop();
        },
    };
}
