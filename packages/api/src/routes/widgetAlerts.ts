import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  createWidgetAlertToken,
  listWidgetAlertTokens,
  recordWidgetDelivery,
  revokeWidgetAlertToken,
  toSummary,
  verifyWidgetAlertSecret,
} from '../services/widgetAlertTokens';
import { publish as publishWidgetAlert, subscribe as subscribeWidgetBus } from '../services/widgetBus';
import { toWidgetAlert } from '../integrations/widgets/streamlabsShape';
import type { NormalizedTwitchEvent } from '../integrations/twitch/eventSub';
import { log } from '../telemetry/logger';

/**
 * Token CRUD + SSE alert stream for browser-source overlay widgets.
 *
 * Token endpoints (auth required):
 *   POST   /tokens         create — returns the plaintext secret ONCE
 *   GET    /tokens         list   — summaries only (never the secret)
 *   DELETE /tokens/:id     revoke
 *
 * Public stream (bearer-secret authenticated; no Blackout user session):
 *   GET    /stream?token=<secret>   server-sent events of alert payloads
 *
 * The SSE endpoint deliberately bypasses the JWT auth — the token IS
 * the credential, and OBS browser sources can't carry an
 * `Authorization` header anyway (they're plain webview iframes).
 */

const widgetAlerts = new Hono();

widgetAlerts.use('/tokens', authRateLimit);
widgetAlerts.use('/tokens/:id', authRateLimit);
widgetAlerts.use('/test', authRateLimit);

const createTokenSchema = z.object({
  label: z.string().min(1).max(64).optional(),
});

widgetAlerts.post('/tokens', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to create a widget token');
  if (userOrResp instanceof Response) return userOrResp;
  const parsed = await readJsonBody(c, createTokenSchema);
  if (parsed instanceof Response) return parsed;
  const created = createWidgetAlertToken({
    blackoutUserId: userOrResp.sub,
    label: parsed.label,
  });
  // The plaintext secret is returned exactly once. Subsequent GETs only
  // see the summary (no secret, no hash).
  return c.json(
    {
      secret: created.secret,
      token: toSummary(created.record),
    },
    201,
  );
});

widgetAlerts.get('/tokens', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list widget tokens');
  if (userOrResp instanceof Response) return userOrResp;
  return c.json({ tokens: listWidgetAlertTokens(userOrResp.sub) });
});

// ----------------------------- synthetic test alert -----------------------------

const testAlertSchema = z.object({
  type: z.enum(['follow', 'subscribe', 'subscription_gift', 'cheer', 'raid']),
  /** Display name to show in the alert. Defaults to "TestUser". */
  name: z.string().min(1).max(64).optional(),
  /** For `cheer`: bits amount. For `subscription_gift`: count of subs. For `raid`: viewer count. */
  amount: z.number().int().nonnegative().optional(),
  /** For `cheer` / `subscribe`: optional message. */
  message: z.string().max(500).optional(),
  /** For `subscribe` / `subscription_gift`: '1000' / '2000' / '3000'. Defaults to '1000'. */
  tier: z.enum(['1000', '2000', '3000']).optional(),
});

const TEST_CHANNEL_ID = '0';
const TEST_USER_ID = '0';

/**
 * Build a synthetic NormalizedTwitchEvent shaped just like a real one,
 * with the broadcaster_user_id pinned to '0' so a downstream listener
 * can identify it as a test if it cares to. We deliberately do NOT
 * attempt to find the creator's real Twitch user id — the test event is
 * for THIS Blackout user's overlays only, regardless of whether they've
 * linked Twitch.
 */
const buildSyntheticEvent = (
  body: z.infer<typeof testAlertSchema>,
): NormalizedTwitchEvent => {
  const name = body.name ?? 'TestUser';
  switch (body.type) {
    case 'follow':
      return {
        kind: 'follow',
        subscriptionType: 'channel.follow',
        twitchChannelId: TEST_CHANNEL_ID,
        followerLogin: name.toLowerCase(),
        followerDisplayName: name,
        followerTwitchId: TEST_USER_ID,
        followedAt: new Date().toISOString(),
      };
    case 'subscribe':
      return {
        kind: 'subscribe',
        subscriptionType: 'channel.subscribe',
        twitchChannelId: TEST_CHANNEL_ID,
        subscriberLogin: name.toLowerCase(),
        subscriberDisplayName: name,
        subscriberTwitchId: TEST_USER_ID,
        tier: body.tier ?? '1000',
        isGift: false,
      };
    case 'subscription_gift':
      return {
        kind: 'subscription_gift',
        subscriptionType: 'channel.subscription.gift',
        twitchChannelId: TEST_CHANNEL_ID,
        gifterLogin: name.toLowerCase(),
        gifterDisplayName: name,
        gifterTwitchId: TEST_USER_ID,
        total: body.amount ?? 1,
        tier: body.tier ?? '1000',
        isAnonymous: false,
      };
    case 'cheer':
      return {
        kind: 'cheer',
        subscriptionType: 'channel.cheer',
        twitchChannelId: TEST_CHANNEL_ID,
        cheererLogin: name.toLowerCase(),
        cheererDisplayName: name,
        cheererTwitchId: TEST_USER_ID,
        bits: body.amount ?? 100,
        message: body.message ?? `Cheer${body.amount ?? 100}`,
        isAnonymous: false,
      };
    case 'raid':
      return {
        kind: 'raid',
        subscriptionType: 'channel.raid',
        fromChannelId: TEST_USER_ID,
        fromChannelLogin: name.toLowerCase(),
        fromChannelDisplayName: name,
        toChannelId: TEST_CHANNEL_ID,
        viewers: body.amount ?? 5,
      };
  }
};

/**
 * POST /test — fire a synthetic alert into THIS user's widget bus. Lets a
 * creator verify their overlay renders correctly without waiting for a
 * real follow / sub / cheer / raid. Returns the count of subscribers the
 * event was delivered to so the UI can warn "no widgets connected".
 */
widgetAlerts.post('/test', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to send a test alert');
  if (userOrResp instanceof Response) return userOrResp;
  const parsed = await readJsonBody(c, testAlertSchema);
  if (parsed instanceof Response) return parsed;

  const synthetic = buildSyntheticEvent(parsed);
  const alert = toWidgetAlert(synthetic);
  if (!alert) {
    return c.json({ code: 'unsupported_test_type', message: parsed.type }, 400);
  }
  const result = publishWidgetAlert(userOrResp.sub, alert);
  return c.json({ ok: true, delivered: result.delivered, alert });
});

widgetAlerts.delete('/tokens/:id', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to revoke a widget token');
  if (userOrResp instanceof Response) return userOrResp;
  const id = c.req.param('id');
  const out = revokeWidgetAlertToken(userOrResp.sub, id);
  switch (out.kind) {
    case 'ok':
      return c.json({ token: toSummary(out.record) });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'No widget token with that id.' }, 404);
    case 'forbidden':
      return c.json({ code: 'forbidden', message: 'You do not own that token.' }, 403);
    case 'already_revoked':
      return c.json(
        { code: 'already_revoked', message: 'Token is already revoked.' },
        409,
      );
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

// ----------------------------- SSE stream -----------------------------

/**
 * Server-Sent Events alert stream. Token is presented either as the
 * `?token=` query param (the only thing OBS browser sources can do) or
 * a `Bearer` Authorization header (for headless dev / curl).
 *
 * The SSE format we emit:
 *   event: alert
 *   id: <publishedAtMs>
 *   data: <JSON of WidgetAlertEvent>
 *
 * Plus periodic ` :keepalive` comment lines (every 25s) so intermediate
 * proxies don't kill an idle connection.
 */
widgetAlerts.get('/stream', (c) => {
  const fromQuery = c.req.query('token') ?? '';
  const fromHeader = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const presented = fromQuery || fromHeader;
  const verified = verifyWidgetAlertSecret(presented);
  if (!verified) {
    return c.json(
      { code: 'invalid_widget_token', message: 'Token is missing, malformed, or revoked.' },
      401,
    );
  }

  // Hono's streamSSE handles the headers (text/event-stream, no-cache,
  // keep-alive) and the underlying response stream lifecycle.
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

    const unsubscribe = subscribeWidgetBus(verified.blackoutUserId, (event) => {
      queue.push(JSON.stringify(event));
      wake();
    });
    stream.onAbort(() => {
      unsubscribe();
      wake();
    });

    // Initial connection event so OBS / browser source UIs can confirm
    // the stream is alive before any alerts have fired.
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ ok: true, scopes: verified.scopes }),
    });

    let lastKeepaliveMs = Date.now();
    const KEEPALIVE_MS = 25_000;

    while (!stream.aborted) {
      if (queue.length > 0) {
        const data = queue.shift()!;
        const parsed = JSON.parse(data) as { publishedAtMs: number };
        try {
          await stream.writeSSE({
            event: 'alert',
            id: String(parsed.publishedAtMs),
            data,
          });
          recordWidgetDelivery(verified);
        } catch (err) {
          log.warn('widget_alerts_sse_write_failed', {
            tokenId: verified.id,
            error: String(err),
          });
          break;
        }
        lastKeepaliveMs = Date.now();
        continue;
      }

      // Cap each iteration at 1s so a `stream.onAbort` that fires between
      // the `while (!stream.aborted)` check and our setting of
      // `resolveNext` (i.e. wake() runs while resolveNext is still null)
      // doesn't trap the loop in a 25-second sleep waiting for the
      // keepalive timer.
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
          // Hono's streamSSE always writes a `data:` line; for a true
          // comment-only keepalive we use a zero-length data field that
          // browsers + EventSource treat as a no-op. Most SSE clients
          // are tolerant of this; if not, the `connected` event already
          // primed them.
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

export default widgetAlerts;
