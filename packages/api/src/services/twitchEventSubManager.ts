import { db } from '../db/store';
import type {
  TwitchChatBridgeRecord,
  TwitchEventSubscriptionRecord,
} from '../db/types';
import {
  createEventSubSubscription,
  deleteEventSubSubscription,
  type CreateEventSubOutcome,
  type HelixDeps,
} from '../integrations/twitch/helix';
import type { NormalizedTwitchEvent } from '../integrations/twitch/eventSub';
import { getLinkedAccount } from './linkedAccounts';
import { log } from '../telemetry/logger';

/**
 * Active subscription manager: turns a chat bridge into a set of
 * EventSub webhook subscriptions registered on Twitch's side, and
 * tears them down when the bridge is deleted. Owns the persistence
 * in `twitch_event_subscriptions`.
 *
 * Phase 1 uses a single global TWITCH_EVENTSUB_SECRET — see migration
 * 010's note on the trade-off. The secret is read from the env at
 * subscribe time and Twitch HMAC-signs every delivery with it.
 */

/** EventSub types we subscribe to per bridge. Each carries its own version + condition shape. */
export interface EventSubTypeConfig {
  type: string;
  version: string;
  /** Build the per-broadcaster condition from the linked Twitch user id. */
  condition: (twitchUserId: string) => Record<string, string>;
}

export const DEFAULT_EVENTSUB_TYPES: readonly EventSubTypeConfig[] = [
  {
    type: 'channel.follow',
    version: '2',
    // v2 follow events require BOTH broadcaster and moderator ids; we use
    // the linked user as moderator-of-self (Twitch accepts this when the
    // app has been granted moderator:read:followers on the broadcaster).
    condition: (id) => ({ broadcaster_user_id: id, moderator_user_id: id }),
  },
  {
    type: 'channel.subscribe',
    version: '1',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'channel.subscription.gift',
    version: '1',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'channel.cheer',
    version: '1',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'channel.raid',
    version: '1',
    // Raid events use to_broadcaster_user_id for incoming raids.
    condition: (id) => ({ to_broadcaster_user_id: id }),
  },
  {
    type: 'stream.online',
    version: '1',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'stream.offline',
    version: '1',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'channel.channel_points_custom_reward_redemption.add',
    version: '1',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'channel.hype_train.begin',
    version: '1',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'channel.hype_train.end',
    version: '1',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
];

export interface SubscribeOptions extends HelixDeps {
  /** Override the type set (mainly for tests). */
  types?: readonly EventSubTypeConfig[];
  /** Override the callback URL. Defaults to BLACKOUT_EVENTSUB_CALLBACK_URL. */
  callbackUrl?: string;
  /** Override the HMAC secret. Defaults to TWITCH_EVENTSUB_SECRET. */
  secret?: string;
}

export interface SubscribeResult {
  created: TwitchEventSubscriptionRecord[];
  /** EventSub types that already had a subscription persisted; left untouched. */
  alreadyPresent: string[];
  /** Failures, surfaced by type so the caller can retry / report. */
  failures: Array<{ type: string; outcome: CreateEventSubOutcome }>;
}

const readCallbackUrl = (override?: string): string | null => {
  const raw = (override ?? process.env.BLACKOUT_EVENTSUB_CALLBACK_URL ?? '').trim();
  return raw || null;
};

const readSecret = (override?: string): string | null => {
  const raw = (override ?? process.env.TWITCH_EVENTSUB_SECRET ?? '').trim();
  return raw || null;
};

/**
 * Subscribe to all configured EventSub types for the given chat bridge's
 * Twitch broadcaster. Idempotent: types already present in
 * twitch_event_subscriptions for this (user, twitchUserId) tuple are
 * skipped without re-calling Helix.
 */
export const subscribeToBridgeEvents = async (
  bridge: TwitchChatBridgeRecord,
  options: SubscribeOptions = {},
): Promise<SubscribeResult> => {
  const result: SubscribeResult = { created: [], alreadyPresent: [], failures: [] };

  const callbackUrl = readCallbackUrl(options.callbackUrl);
  if (!callbackUrl) {
    log.warn('twitch_eventsub_callback_url_not_configured', { bridgeId: bridge.id });
    result.failures.push({
      type: '*',
      outcome: { kind: 'failed', status: 0, detail: 'BLACKOUT_EVENTSUB_CALLBACK_URL not set' },
    });
    return result;
  }
  const secret = readSecret(options.secret);
  if (!secret) {
    result.failures.push({
      type: '*',
      outcome: { kind: 'failed', status: 0, detail: 'TWITCH_EVENTSUB_SECRET not set' },
    });
    return result;
  }

  const link = getLinkedAccount(bridge.blackoutUserId, 'twitch');
  if (!link) {
    result.failures.push({
      type: '*',
      outcome: { kind: 'failed', status: 0, detail: 'no_linked_twitch_account' },
    });
    return result;
  }
  const twitchUserId = link.providerUserId;

  const existing = new Set(
    db
      .listTwitchEventSubscriptionsForChannel(bridge.blackoutUserId, twitchUserId)
      .map((row) => row.subscriptionType),
  );

  const types = options.types ?? DEFAULT_EVENTSUB_TYPES;
  for (const cfg of types) {
    if (existing.has(cfg.type)) {
      result.alreadyPresent.push(cfg.type);
      continue;
    }
    const outcome = await createEventSubSubscription(
      {
        type: cfg.type,
        version: cfg.version,
        condition: cfg.condition(twitchUserId),
        callbackUrl,
        secret,
      },
      { fetch: options.fetch, now: options.now },
    );
    if (outcome.kind !== 'ok') {
      log.warn('twitch_eventsub_subscribe_failed', {
        bridgeId: bridge.id,
        type: cfg.type,
        outcome: outcome.kind,
      });
      result.failures.push({ type: cfg.type, outcome });
      continue;
    }
    const persisted = db.createTwitchEventSubscription({
      id: crypto.randomUUID(),
      blackoutUserId: bridge.blackoutUserId,
      twitchUserId,
      subscriptionType: cfg.type,
      helixSubscriptionId: outcome.subscription.id,
      status: outcome.subscription.status,
    });
    result.created.push(persisted);
  }
  return result;
};

export interface UnsubscribeResult {
  deleted: number;
  failed: Array<{ helixSubscriptionId: string; status: number; detail: string }>;
}

/**
 * Tear down every EventSub subscription persisted for the given bridge.
 * Best-effort: if Twitch returns an error other than 404 we keep the
 * row so a retry can complete the cleanup. 404 is treated as success
 * (Twitch already lost the subscription, e.g. expired user auth).
 */
export const unsubscribeBridgeEvents = async (
  bridge: TwitchChatBridgeRecord,
  options: HelixDeps = {},
): Promise<UnsubscribeResult> => {
  const result: UnsubscribeResult = { deleted: 0, failed: [] };
  const link = getLinkedAccount(bridge.blackoutUserId, 'twitch');
  if (!link) return result;
  const rows = db.listTwitchEventSubscriptionsForChannel(bridge.blackoutUserId, link.providerUserId);
  for (const row of rows) {
    const outcome = await deleteEventSubSubscription(row.helixSubscriptionId, options);
    if (outcome.kind === 'ok' || outcome.kind === 'not_found') {
      db.deleteTwitchEventSubscription(row.helixSubscriptionId);
      result.deleted += 1;
      continue;
    }
    if (outcome.kind === 'unauthorized') {
      log.warn('twitch_eventsub_unsubscribe_unauthorized', {
        bridgeId: bridge.id,
        helixSubscriptionId: row.helixSubscriptionId,
      });
      result.failed.push({
        helixSubscriptionId: row.helixSubscriptionId,
        status: 401,
        detail: 'unauthorized',
      });
      continue;
    }
    result.failed.push({
      helixSubscriptionId: row.helixSubscriptionId,
      status: outcome.status,
      detail: outcome.detail,
    });
  }
  return result;
};

// ----------------------------- inbound event lookup -----------------------------

/**
 * Given a normalized EventSub event, find the chat bridge it belongs to
 * (if any). Used by the EventSub route's onEvent handler to decide which
 * Matrix room to forward an alert into.
 */
export const findBridgeForEvent = (
  event: NormalizedTwitchEvent,
): TwitchChatBridgeRecord | null => {
  // Pull the relevant Twitch user id out of the event union; raids carry
  // the *destination* channel id (i.e. the linked broadcaster).
  const twitchUserId =
    event.kind === 'raid' ? event.toChannelId : event.twitchChannelId;
  if (!twitchUserId) return null;

  // The mapping is twitch_user_id → linked_account.provider_user_id →
  // bridge owner. Multiple bridges per Twitch user are possible only if
  // a creator linked multiple times; we pick the most recently updated.
  const subs = [...db.twitchEventSubscriptions.values()].filter(
    (row) => row.twitchUserId === twitchUserId,
  );
  for (const sub of subs) {
    const bridges = db.listTwitchChatBridgesForUser(sub.blackoutUserId);
    const active = bridges.find((b) => b.isActive);
    if (active) return active;
  }
  return null;
};
