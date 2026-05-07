import { Hono } from 'hono';
import {
  normalizeEventSub,
  verifyEventSubMessage,
  type EventSubNotification,
  type NormalizedTwitchEvent,
} from '../integrations/twitch/eventSub';
import { findBridgeForEvent } from '../services/twitchEventSubManager';
import { matrixClient as defaultMatrixClient } from '../integrations/matrix-client';
import type { MatrixSendEventClient } from '../services/twitchChatBridge';
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
  /**
   * Called after successful verification + normalization; ack runs regardless.
   * If omitted, falls back to {@link defaultEventForwarder} which finds the
   * bridge for the event and ships a Matrix alert event into its room.
   */
  onEvent?: (event: NormalizedTwitchEvent, raw: EventSubNotification) => void | Promise<void>;
  /** Pluggable Matrix client (used by the default forwarder). Tests override. */
  matrixClient?: MatrixSendEventClient;
  /** Override clock for tests. */
  now?: () => number;
}

const defaultSecretResolver: EventSubSecretResolver = () =>
  process.env.TWITCH_EVENTSUB_SECRET?.trim() || undefined;

// ----------------------------- Matrix alert event content -----------------------------

/**
 * Build the Matrix `m.room.message` content for a normalized Twitch alert.
 * Mirrors the chat-bridge's `m.blackout.*` envelope so client renderers
 * can show a single unified attribution badge for Twitch-origin events.
 */
const buildAlertContent = (event: NormalizedTwitchEvent): Record<string, unknown> => {
  const base: Record<string, unknown> = {
    msgtype: 'm.notice',
    'm.blackout.origin': 'twitch',
    'm.blackout.alert_kind': event.kind,
    'm.blackout.event': event,
  };
  // Plain-text fallback that surfaces in clients without alert UI.
  switch (event.kind) {
    case 'follow':
      base.body = `[twitch] ${event.followerDisplayName ?? event.followerLogin} just followed.`;
      break;
    case 'subscribe':
      base.body = `[twitch] ${event.subscriberDisplayName ?? event.subscriberLogin} subscribed (tier ${event.tier})${event.isGift ? ' — gift' : ''}.`;
      break;
    case 'subscription_gift':
      base.body = `[twitch] ${event.gifterDisplayName ?? event.gifterLogin} gifted ${event.total} sub${event.total === 1 ? '' : 's'} (tier ${event.tier}).`;
      break;
    case 'cheer':
      base.body = `[twitch] ${event.cheererDisplayName ?? event.cheererLogin ?? 'Anonymous'} cheered ${event.bits} bits: ${event.message}`;
      break;
    case 'raid':
      base.body = `[twitch] ${event.fromChannelDisplayName ?? event.fromChannelLogin} raided with ${event.viewers} viewer${event.viewers === 1 ? '' : 's'}.`;
      break;
  }
  return base;
};

/**
 * Default `onEvent` handler used when the route is built with no override.
 * Looks up the chat bridge for the event's broadcaster and ships a Matrix
 * alert event into the bridged room. No-ops (with a log line) when no
 * bridge exists for the event — that's the case if a bridge was deleted
 * between Helix subscription create and the next inbound notification.
 */
export const buildDefaultEventForwarder = (
  matrix: MatrixSendEventClient = defaultMatrixClient,
) => async (event: NormalizedTwitchEvent, raw: EventSubNotification): Promise<void> => {
  const bridge = findBridgeForEvent(event);
  if (!bridge) {
    log.info('twitch_eventsub_no_bridge_for_event', {
      kind: event.kind,
      subscriptionId: raw.subscription.id,
    });
    return;
  }
  const content = buildAlertContent(event);
  // Use the EventSub subscription id + Twitch's message-id-equivalent
  // (subscription created_at + event timestamp) as the Matrix txn id when
  // possible, so retransmits don't double-deliver. We don't have a stable
  // per-event id from Twitch in every payload, so fall back to a derived
  // hash-shaped string — Matrix will accept any string.
  const txnId = `twitch-eventsub-${raw.subscription.id}-${Date.now()}`;
  const result = await matrix.sendEvent(bridge.matrixRoomId, content, { txnId });
  if (!result.ok) {
    log.warn('twitch_eventsub_matrix_send_failed', {
      bridgeId: bridge.id,
      kind: event.kind,
      status: result.status,
      reason: result.reason,
    });
  }
};

export const buildTwitchEventSubRoute = (options: EventSubRouteOptions = {}) => {
  const router = new Hono();
  const secretResolver = options.secretResolver ?? defaultSecretResolver;
  const onEvent =
    options.onEvent ?? buildDefaultEventForwarder(options.matrixClient ?? defaultMatrixClient);

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
    try {
      await onEvent(normalized, notification);
    } catch (err) {
      log.warn('twitch_eventsub_handler_threw', {
        subscriptionType: notification.subscription.type,
        error: String(err),
      });
    }
    return c.json({ ok: true });
  });

  return router;
};

/** Default router used by the API server. */
const defaultRouter = buildTwitchEventSubRoute();
export default defaultRouter;
