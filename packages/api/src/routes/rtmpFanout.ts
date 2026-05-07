import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  getStatus,
  listForUser,
  startFanout,
  stopFanout,
} from '../services/rtmpFanoutWorker';

/**
 * Phase 1 / Track A: control surface for the per-destination ffmpeg
 * supervisor (services/rtmpFanoutWorker). Lets a creator kick a
 * fan-out off / cut it / inspect status from the dashboard. Auto-start
 * on stream go-live happens in the streaming module — these routes are
 * for manual control + observability.
 */

const router = new Hono();
router.use('/', authRateLimit);
router.use('/:destinationId/*', authRateLimit);

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
        { code: 'disabled', message: 'Destination is disabled. Enable it before starting.' },
        409,
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
      return c.json({ code: 'not_running', message: 'No active fanout for that destination.' }, 404);
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

export default router;
