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
import { publish as publishWidgetAlert } from '../services/widgetBus';
import { toWidgetAlert } from '../integrations/widgets/streamlabsShape';
import { dispatchEvent as dispatchOutboundEvent } from '../services/outboundEventWebhooks';
import type { OutboundEventType } from '../db/types';
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

  // Fan out to the widget SSE bus FIRST so browser-source overlays render
  // the alert before the Matrix room renders the chat-attribution version
  // — overlays are timing-sensitive, Matrix isn't. The bus call is
  // synchronous + in-process so this adds no perceptible delay.
  const alert = toWidgetAlert(event);
  if (alert) {
    publishWidgetAlert(bridge.blackoutUserId, alert);
  }

  // Project to the outbound webhook event type. We dispatch when the
  // event maps to a known OutboundEventType; the 'raid' kind splits on
  // direction (the EventSub event carries the *destination* channel id,
  // so a creator's bridge match means they're being raided INTO, not
  // raiding out — which is what `raid.received` semantically means).
  const dispatchOutbound = (
    type: OutboundEventType,
    data: Record<string, unknown>,
    occurredAt?: string,
  ) => {
    void dispatchOutboundEvent({
      type,
      blackoutUserId: bridge.blackoutUserId,
      data: { source: 'twitch', ...data },
      occurredAt,
    }).catch((err) =>
      log.warn('twitch_eventsub_outbound_dispatch_threw', {
        kind: event.kind,
        error: String(err),
      }),
    );
  };

  switch (event.kind) {
    case 'follow':
      dispatchOutbound(
        'follow.created',
        {
          twitchChannelId: event.twitchChannelId,
          followerLogin: event.followerLogin,
          followerDisplayName: event.followerDisplayName,
          followedAt: event.followedAt,
        },
        event.followedAt,
      );
      break;
    case 'subscribe':
      // The standalone subscribe event fires for non-gifted subs;
      // gifted subs come through the 'subscription_gift' kind below
      // (where each gifted sub also produces a separate subscribe
      // event with isGift=true). We forward both, which means a
      // 5-sub gift bomb fires 1 × subscriber.gifted + 5 × subscriber.created.
      dispatchOutbound('subscriber.created', {
        twitchChannelId: event.twitchChannelId,
        subscriberLogin: event.subscriberLogin,
        subscriberDisplayName: event.subscriberDisplayName,
        tier: event.tier,
        isGift: event.isGift,
      });
      break;
    case 'subscription_gift':
      dispatchOutbound('subscriber.gifted', {
        twitchChannelId: event.twitchChannelId,
        gifterLogin: event.isAnonymous ? null : event.gifterLogin,
        gifterDisplayName: event.isAnonymous ? null : event.gifterDisplayName,
        total: event.total,
        tier: event.tier,
        cumulativeTotal: event.cumulativeTotal,
        isAnonymous: event.isAnonymous,
      });
      break;
    case 'cheer':
      dispatchOutbound('cheer.received', {
        twitchChannelId: event.twitchChannelId,
        cheererLogin: event.isAnonymous ? null : event.cheererLogin,
        cheererDisplayName: event.isAnonymous ? null : event.cheererDisplayName,
        bits: event.bits,
        message: event.message,
        isAnonymous: event.isAnonymous,
      });
      break;
    case 'raid':
      dispatchOutbound('raid.received', {
        fromChannelId: event.fromChannelId,
        fromChannelLogin: event.fromChannelLogin,
        fromChannelDisplayName: event.fromChannelDisplayName,
        viewers: event.viewers,
      });
      break;
  }

  const content = buildAlertContent(event);
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
