import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { requireUser } from '../middleware/require-user';
import { integrationsRateLimit } from '../middleware/rate-limit';
import {
    getStatus,
    listForUser,
    startFanout,
    stopFanout,
    subscribeStatusForUser,
} from '../services/rtmpFanoutWorker';
import { log } from '../telemetry/logger';

/**
 * Phase 1 / Track A: control surface for the per-destination ffmpeg
 * supervisor (services/rtmpFanoutWorker). Lets a creator kick a
 * fan-out off / cut it / inspect status from the dashboard. Auto-start
 * on stream go-live happens in the streaming module — these routes are
 * for manual control + observability.
 */

const router = new Hono();
// Settings-surface bucket, NOT the tight fail-closed `auth` bucket: the
// broadcast panel lists fanout state on mount alongside its siblings.
router.use('/', integrationsRateLimit);
router.use('/:destinationId/*', integrationsRateLimit);

router.get('/', (c) => {
    const userOrResp = requireUser(c, 'Sign in required to list RTMP fanouts');
    if (userOrResp instanceof Response) return userOrResp;
    return c.json({ fanouts: listForUser(userOrResp.sub) });
});

router.post('/:destinationId/start', (c) => {
    const userOrResp = requireUser(c, 'Sign in required to start a fanout');
    if (userOrResp instanceof Response) return userOrResp;
    const id = c.req.param('destinationId');
    const out = startFanout(userOrResp.sub, id);
    switch (out.kind) {
        case 'ok':
        case 'already_running':
            return c.json({ ok: true, status: getStatus(id) });
        case 'not_found':
            return c.json({ code: 'not_found', message: 'No destination with that id.' }, 404);
        case 'forbidden':
            return c.json({ code: 'forbidden', message: 'You do not own that destination.' }, 403);
        case 'disabled':
            return c.json(
                {
                    code: 'disabled',
                    message: 'Destination is disabled. Enable it before starting.',
                },
                409
            );
        case 'spawn_failed':
            return c.json({ code: 'spawn_failed', message: out.reason }, 500);
        default: {
            const exhaustive: never = out;
            return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
        }
    }
});

router.post('/:destinationId/stop', (c) => {
    const userOrResp = requireUser(c, 'Sign in required to stop a fanout');
    if (userOrResp instanceof Response) return userOrResp;
    const id = c.req.param('destinationId');
    const out = stopFanout(userOrResp.sub, id);
    switch (out.kind) {
        case 'ok':
            return c.json({ ok: true, status: getStatus(id) });
        case 'not_running':
            return c.json(
                { code: 'not_running', message: 'No active fanout for that destination.' },
                404
            );
        case 'forbidden':
            return c.json({ code: 'forbidden', message: 'You do not own that destination.' }, 403);
        default: {
            const exhaustive: never = out;
            return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
        }
    }
});

router.get('/:destinationId/status', (c) => {
    const userOrResp = requireUser(c, 'Sign in required to read fanout status');
    if (userOrResp instanceof Response) return userOrResp;
    const id = c.req.param('destinationId');
    const status = getStatus(id);
    if (!status) {
        return c.json({ status: { destinationId: id, status: 'idle' } });
    }
    if (status.blackoutUserId !== userOrResp.sub) {
        return c.json({ code: 'forbidden', message: 'You do not own that destination.' }, 403);
    }
    return c.json({ status });
});

/**
 * Live status pipe. Sends an initial snapshot for every fanout the
 * caller currently has, then a JSON-encoded `status` event each time the
 * supervisor flips a destination's status. 25s comment-only keepalives
 * keep the connection alive across reverse proxies. Closes cleanly on
 * client abort.
 */
router.get('/stream', (c) => {
    const userOrResp = requireUser(c, 'Sign in required to subscribe to fanout status');
    if (userOrResp instanceof Response) return userOrResp;
    const blackoutUserId = userOrResp.sub;

    return streamSSE(c, async (stream) => {
        const queue: string[] = [];
        let resolveNext: (() => void) | null = null;
        const wake = () => {
            if (resolveNext) {
                const r = resolveNext;
                resolveNext = null;
                r();
            }
        };

        const unsubscribe = subscribeStatusForUser(blackoutUserId, (snapshot) => {
            queue.push(JSON.stringify(snapshot));
            wake();
        });
        stream.onAbort(() => {
            unsubscribe();
            wake();
        });

        // Snapshot of current state on connect so the UI doesn't need to
        // call GET / and GET /stream separately on mount.
        await stream.writeSSE({
            event: 'connected',
            data: JSON.stringify({ ok: true, snapshots: listForUser(blackoutUserId) }),
        });

        let lastKeepaliveMs = Date.now();
        const KEEPALIVE_MS = 25_000;

        while (!stream.aborted) {
            if (queue.length > 0) {
                const data = queue.shift()!;
                try {
                    await stream.writeSSE({ event: 'status', data });
                } catch (err) {
                    log.warn('rtmp_fanout_sse_write_failed', {
                        blackoutUserId,
                        error: String(err),
                    });
                    break;
                }
                lastKeepaliveMs = Date.now();
                continue;
            }

            // Cap each iteration at 1s so an abort racing with the wake() /
            // resolveNext sequence doesn't trap the loop in a 25s sleep.
            const idleMs = Date.now() - lastKeepaliveMs;
            const sleepMs = Math.min(1000, Math.max(50, KEEPALIVE_MS - idleMs));
            await new Promise<void>((resolve) => {
                resolveNext = resolve;
                setTimeout(() => {
                    if (resolveNext === resolve) {
                        resolveNext = null;
                        resolve();
                    }
                }, sleepMs);
            });

            if (Date.now() - lastKeepaliveMs >= KEEPALIVE_MS) {
                try {
                    await stream.writeSSE({ event: 'keepalive', data: '' });
                } catch {
                    break;
                }
                lastKeepaliveMs = Date.now();
            }
        }

        unsubscribe();
    });
});

export default router;
