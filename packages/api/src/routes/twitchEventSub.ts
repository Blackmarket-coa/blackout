import { Hono } from 'hono';
import {
  normalizeEventSub,
  verifyEventSubMessage,
  type EventSubNotification,
  type NormalizedTwitchEvent,
} from '../integrations/twitch/eventSub';
import { log } from '../telemetry/logger';

/**
 * HTTP transport for Twitch EventSub deliveries.
 *
 * Twitch sends three message types:
 *
 *   - webhook_callback_verification — sent on subscribe; we MUST echo back
 *     the `challenge` field as plaintext within 10 seconds or the
 *     subscription is dropped.
 *   - notification                  — the actual events (follow, sub, cheer,
 *     raid, ...). We HMAC-verify, normalize, and dispatch.
 *   - revocation                    — subscription was revoked (e.g. user
 *     unlinked). We log + acknowledge.
 *
 * Deliberately does NOT live behind the per-user auth middleware: Twitch's
 * own server originates these requests and there's no Blackout user
 * session on the connection. Authentication is the HMAC signature against
 * the per-subscription secret.
 *
 * The signing secret resolution is pluggable via {@link EventSubSecretResolver}
 * so each subscription can have its own secret (the eventual "subscription
 * manager" will store one per Helix subscription); the current default
 * resolver reads a single global secret from `TWITCH_EVENTSUB_SECRET` so
 * we can ship the receiver before the active subscription manager.
 */

export type EventSubSecretResolver = (subscriptionType: string) => string | undefined;

export interface EventSubRouteOptions {
  /** Resolves the per-subscription HMAC secret. Defaults to the env var. */
  secretResolver?: EventSubSecretResolver;
  /** Called after successful verification + normalization; ack runs regardless. */
  onEvent?: (event: NormalizedTwitchEvent, raw: EventSubNotification) => void | Promise<void>;
  /** Override clock for tests. */
  now?: () => number;
}

const defaultSecretResolver: EventSubSecretResolver = () =>
  process.env.TWITCH_EVENTSUB_SECRET?.trim() || undefined;

export const buildTwitchEventSubRoute = (options: EventSubRouteOptions = {}) => {
  const router = new Hono();
  const secretResolver = options.secretResolver ?? defaultSecretResolver;

  router.post('/', async (c) => {
    // Read the body as the raw text BEFORE parsing. The HMAC is computed
    // over the bytes Twitch sent, so any whitespace normalization (e.g.
    // re-stringifying parsed JSON) would invalidate the signature.
    const rawBody = await c.req.text();

    const headers: Record<string, string | undefined> = {};
    // Hono normalizes header names to lower-case; copy them into a flat map.
    for (const [key, value] of Object.entries(c.req.header())) {
      headers[key.toLowerCase()] = value;
    }
    const subscriptionTypeHeader = headers['twitch-eventsub-subscription-type'];
    const secret = secretResolver(subscriptionTypeHeader ?? '');
    if (!secret) {
      log.warn('twitch_eventsub_no_secret_configured', {
        subscriptionType: subscriptionTypeHeader,
      });
      // 503 (not 401) so Twitch retries — operator misconfiguration is
      // recoverable, signature mismatch is not.
      return c.json(
        { code: 'eventsub_misconfigured', message: 'TWITCH_EVENTSUB_SECRET is not set.' },
        503,
      );
    }

    const verified = verifyEventSubMessage({ headers, rawBody, secret, now: options.now });
    if (verified.kind !== 'ok') {
      log.warn('twitch_eventsub_rejected', {
        kind: verified.kind,
        subscriptionType: subscriptionTypeHeader,
      });
      // 403 for any rejection; Twitch will not retry on 403, which is the
      // correct behavior for forged / replayed deliveries.
      return c.json({ code: verified.kind }, 403);
    }

    let parsed: { challenge?: string; subscription?: EventSubNotification['subscription']; event?: EventSubNotification['event'] };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return c.json({ code: 'invalid_json' }, 400);
    }

    if (verified.messageType === 'webhook_callback_verification') {
      // Spec: respond 200 with the challenge string as plain text.
      if (typeof parsed.challenge !== 'string') {
        return c.json({ code: 'missing_challenge' }, 400);
      }
      return c.text(parsed.challenge, 200);
    }

    if (verified.messageType === 'revocation') {
      log.info('twitch_eventsub_revoked', {
        subscriptionType: parsed.subscription?.type,
        subscriptionId: parsed.subscription?.id,
        status: parsed.subscription?.status,
      });
      return c.json({ ok: true });
    }

    // notification
    if (!parsed.subscription || !parsed.event) {
      return c.json({ code: 'invalid_notification_body' }, 400);
    }
    const notification: EventSubNotification = {
      subscription: parsed.subscription,
      event: parsed.event,
    };
    const normalized = normalizeEventSub(notification);
    if (!normalized) {
      log.info('twitch_eventsub_unhandled_type', { subscriptionType: notification.subscription.type });
      return c.json({ ok: true });
    }
    if (options.onEvent) {
      try {
        await options.onEvent(normalized, notification);
      } catch (err) {
        log.warn('twitch_eventsub_handler_threw', {
          subscriptionType: notification.subscription.type,
          error: String(err),
        });
      }
    }
    return c.json({ ok: true });
  });

  return router;
};

/** Default router used by the API server. */
const defaultRouter = buildTwitchEventSubRoute();
export default defaultRouter;
