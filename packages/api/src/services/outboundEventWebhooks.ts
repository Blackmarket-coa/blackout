import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from '../db/store';
import type { OutboundEventType, OutboundEventWebhookRecord } from '../db/types';
import { decryptSecret, encryptSecret, envelopeKeyId } from './secretBox';
import { log } from '../telemetry/logger';

/**
 * Phase 2 / Track B: outbound Discord-shape webhook subscriptions.
 *
 * Inverse of services/discordCompatWebhooks.ts. A creator registers a URL
 * (their own Discord channel webhook → Blackout writes back to Discord
 * with no OAuth required; or a Zapier / IFTTT / n8n / custom backend) and
 * we POST Blackout events to it in Discord embed shape.
 *
 * The receiver is identified only by the `targetUrl` they entered. We
 * sign each delivery with HMAC-SHA256 over `${timestamp}.${body}` using a
 * per-subscription shared secret. Discord's own webhook URLs ignore
 * the signature header gracefully; custom receivers can verify it
 * exactly as Stripe / GitHub / Slack do.
 */

const SECRET_BYTES = 32;
const NAME_MAX = 80;
const URL_MAX = 2048;
const FAILURE_PAUSE_THRESHOLD = 5;
const DELIVERY_TIMEOUT_MS = 10_000;

const VALID_EVENT_TYPES: ReadonlySet<OutboundEventType> = new Set<OutboundEventType>([
  'tip.created',
  'follow.created',
  'livestream.started',
  'livestream.ended',
  'chat.message.received',
  'subscriber.created',
  'subscriber.gifted',
  'cheer.received',
  'raid.received',
  'streamgoal.reached',
  'channelpoints.redeemed',
  'hypetrain.started',
  'hypetrain.ended',
]);

/**
 * AAD that binds a row's ciphertext to the row identity. Identical idea to
 * services/linkedAccounts.ts: a leaked envelope can't be replayed against
 * a different subscription because the GCM tag won't validate.
 */
const aadFor = (subscriptionId: string): string =>
  `outbound_event_webhook|${subscriptionId}`;

const decryptSigningSecret = (record: OutboundEventWebhookRecord): string =>
  decryptSecret(record.signingSecretCiphertext, { aad: aadFor(record.id) });

export interface RegisterInput {
  blackoutUserId: string;
  name: string;
  targetUrl: string;
  /** Empty array means "all event types". */
  eventTypes: OutboundEventType[];
}

export type RegisterOutcome =
  | {
      kind: 'ok';
      record: OutboundEventWebhookRecord;
      /** Plaintext HMAC signing secret. Returned only at create time. */
      signingSecret: string;
    }
  | { kind: 'invalid_input'; reason: string };

const validateRegister = (
  input: RegisterInput,
): { ok: true } | { ok: false; reason: string } => {
  if (!input.blackoutUserId) return { ok: false, reason: 'blackoutUserId is required' };
  const name = input.name?.trim();
  if (!name) return { ok: false, reason: 'name is required' };
  if (name.length > NAME_MAX) {
    return { ok: false, reason: `name must be ≤ ${NAME_MAX} chars` };
  }
  const url = input.targetUrl?.trim();
  if (!url) return { ok: false, reason: 'targetUrl is required' };
  if (url.length > URL_MAX) {
    return { ok: false, reason: `targetUrl must be ≤ ${URL_MAX} chars` };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'targetUrl must be a valid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'targetUrl must use http(s)' };
  }
  // Block localhost / private space targets to defang SSRF. The
  // simulcast destinations service has the same posture.
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return { ok: false, reason: 'targetUrl points at a non-routable host' };
  }
  for (const t of input.eventTypes ?? []) {
    if (!VALID_EVENT_TYPES.has(t)) {
      return { ok: false, reason: `unknown event type: ${t}` };
    }
  }
  return { ok: true };
};

export const register = (input: RegisterInput): RegisterOutcome => {
  const valid = validateRegister(input);
  if (!valid.ok) return { kind: 'invalid_input', reason: valid.reason };
  const signingSecret = randomBytes(SECRET_BYTES).toString('base64url');
  const id = randomUUID();
  const ciphertext = encryptSecret(signingSecret, { aad: aadFor(id) });
  const record = db.createOutboundEventWebhook({
    id,
    blackoutUserId: input.blackoutUserId,
    name: input.name.trim(),
    targetUrl: input.targetUrl.trim(),
    signingSecretCiphertext: ciphertext,
    encryptionKeyId: envelopeKeyId(ciphertext),
    eventTypes: [...new Set(input.eventTypes)],
    isActive: true,
    consecutiveFailures: 0,
    deliveryCount: 0,
  });
  return { kind: 'ok', record, signingSecret };
};

export const listForUser = (userId: string): OutboundEventWebhookRecord[] =>
  db.listOutboundEventWebhooksForUser(userId);

export type DeleteOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export const deleteSubscription = (
  blackoutUserId: string,
  subscriptionId: string,
): DeleteOutcome => {
  const existing = db.getOutboundEventWebhook(subscriptionId);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };
  db.deleteOutboundEventWebhook(subscriptionId);
  return { kind: 'ok' };
};

// --------------------------- delivery ---------------------------------------

/**
 * Discord-shape execute payload we emit. We project Blackout events onto
 * `embeds[0]` so the Discord-side rendering surfaces a structured card,
 * not a raw text dump. `content` carries a 1-line summary.
 */
export interface OutboundDeliveryPayload {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    timestamp?: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text?: string };
  }>;
}

export interface BlackoutEvent {
  type: OutboundEventType;
  /** Owning user — only their subscriptions receive this event. */
  blackoutUserId: string;
  /** Free-form payload, must be JSON-serialisable. */
  data: Record<string, unknown>;
  /** Optional explicit timestamp (defaults to now). */
  occurredAt?: string;
}

const fieldsFromObject = (obj: Record<string, unknown>): Array<{ name: string; value: string }> => {
  const out: Array<{ name: string; value: string }> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (!s) continue;
    out.push({ name: k, value: s.length > 1024 ? `${s.slice(0, 1021)}...` : s });
  }
  return out;
};

/**
 * Translate a BlackoutEvent into a Discord-execute payload. Pure function
 * so it's easy to assert in tests.
 */
export const renderEvent = (event: BlackoutEvent): OutboundDeliveryPayload => {
  const ts = event.occurredAt ?? new Date().toISOString();
  const titleByType: Record<OutboundEventType, string> = {
    'tip.created': 'New tip',
    'follow.created': 'New follow',
    'livestream.started': 'Livestream started',
    'livestream.ended': 'Livestream ended',
    'chat.message.received': 'Chat message',
    'subscriber.created': 'New subscriber',
    'subscriber.gifted': 'Subs gifted',
    'cheer.received': 'Cheer / Bits',
    'raid.received': 'Raid incoming',
    'streamgoal.reached': 'Stream goal reached',
    'channelpoints.redeemed': 'Channel points redeemed',
    'hypetrain.started': 'Hype Train started',
    'hypetrain.ended': 'Hype Train ended',
    'governance.proposal.resolved': 'Governance proposal resolved',
  };
  const colorByType: Record<OutboundEventType, number> = {
    'tip.created': 0xf2c94c,
    'follow.created': 0x6fcf97,
    'livestream.started': 0xeb5757,
    'livestream.ended': 0x828282,
    'chat.message.received': 0x56ccf2,
    'subscriber.created': 0x9b51e0,
    'subscriber.gifted': 0xbb6bd9,
    'cheer.received': 0x2d9cdb,
    'raid.received': 0xf2994a,
    'streamgoal.reached': 0x27ae60,
    'channelpoints.redeemed': 0x9146ff,
    'hypetrain.started': 0xff6905,
    'hypetrain.ended': 0xb35704,
    'governance.proposal.resolved': 0x9d8df1,
  };
  return {
    username: 'Blackout',
    content: titleByType[event.type] ?? event.type,
    embeds: [
      {
        title: titleByType[event.type] ?? event.type,
        color: colorByType[event.type] ?? 0xbb86fc,
        timestamp: ts,
        fields: fieldsFromObject(event.data),
        footer: { text: `event: ${event.type}` },
      },
    ],
  };
};

export const SIGNATURE_HEADER = 'x-blackout-signature';
export const TIMESTAMP_HEADER = 'x-blackout-timestamp';
export const EVENT_TYPE_HEADER = 'x-blackout-event-type';
export const DELIVERY_ID_HEADER = 'x-blackout-delivery-id';

/**
 * Compute the HMAC signature header value for a given body+timestamp+secret.
 * Receivers verify by recomputing this; the wire format is GitHub /
 * Stripe-style: `sha256=<hex>` so a stale receiver pattern still parses.
 */
export const computeSignature = (
  signingSecret: string,
  timestamp: string,
  body: string,
): string => {
  const mac = createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex');
  return `sha256=${mac}`;
};

export const verifySignature = (
  signingSecret: string,
  timestamp: string,
  body: string,
  presented: string,
): boolean => {
  const expected = computeSignature(signingSecret, timestamp, body);
  if (presented.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
  } catch {
    return false;
  }
};

export interface DeliverOptions {
  /** Override fetch for tests. */
  fetchFn?: typeof fetch;
  /** Override the abort timeout. */
  timeoutMs?: number;
  /**
   * Override the signing secret. Production callers should NOT pass this —
   * the service unwraps the encrypted-at-rest secret internally. Tests use
   * it to dodge needing LINKED_ACCOUNT_ENCRYPTION_KEYS configuration in
   * micro-suites.
   */
  signingSecretOverride?: string;
}

export interface DeliveryReport {
  subscriptionId: string;
  status?: number;
  ok: boolean;
  reason?: string;
}

const matchesEventType = (
  record: OutboundEventWebhookRecord,
  eventType: OutboundEventType,
): boolean => record.eventTypes.length === 0 || record.eventTypes.includes(eventType);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DispatchOnceArgs {
  record: OutboundEventWebhookRecord;
  signingSecret: string;
  payload: OutboundDeliveryPayload;
  event: BlackoutEvent;
  fetchFn: typeof fetch;
  timeoutMs: number;
  attempt: number;
}

const dispatchOnce = async ({
  record,
  signingSecret,
  payload,
  event,
  fetchFn,
  timeoutMs,
  attempt,
}: DispatchOnceArgs): Promise<{ ok: boolean; status?: number; reason?: string }> => {
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const deliveryId = `${record.id}.${event.type}.${attempt}.${randomUUID()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(record.targetUrl, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Blackout-Webhook/1.0',
        [SIGNATURE_HEADER]: computeSignature(signingSecret, timestamp, body),
        [TIMESTAMP_HEADER]: timestamp,
        [EVENT_TYPE_HEADER]: event.type,
        [DELIVERY_ID_HEADER]: deliveryId,
      },
      body,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, reason: String((err as Error)?.name === 'AbortError' ? 'timeout' : err) };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Deliver an event to one specific subscription. Public so the manual
 * "test-deliver" endpoint can target a single sub without firing the
 * full fan-out loop. Two retry attempts on transient failure (5xx /
 * network), exponential backoff. After {@link FAILURE_PAUSE_THRESHOLD}
 * consecutive failures the subscription is auto-paused.
 */
export const deliverToSubscription = async (
  record: OutboundEventWebhookRecord,
  event: BlackoutEvent,
  options: DeliverOptions = {},
): Promise<DeliveryReport> => {
  if (!record.isActive) {
    return { subscriptionId: record.id, ok: false, reason: 'inactive' };
  }
  let signingSecret: string;
  try {
    signingSecret = options.signingSecretOverride ?? decryptSigningSecret(record);
  } catch (err) {
    log.warn('outbound_event_webhook_decrypt_failed', {
      subscriptionId: record.id,
      error: String(err),
    });
    return { subscriptionId: record.id, ok: false, reason: 'decrypt_failed' };
  }

  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DELIVERY_TIMEOUT_MS;
  const payload = renderEvent(event);

  let last: { ok: boolean; status?: number; reason?: string } = { ok: false };
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await dispatchOnce({
      record,
      signingSecret,
      payload,
      event,
      fetchFn,
      timeoutMs,
      attempt,
    });
    if (last.ok) break;
    // Don't retry 4xx — they won't get better. Only network failures and
    // 5xx are transient.
    if (last.status !== undefined && last.status < 500) break;
    if (attempt < 3) await sleep(250 * attempt);
  }

  const now = new Date().toISOString();
  const failures = last.ok ? 0 : record.consecutiveFailures + 1;
  const pausing = !last.ok && failures >= FAILURE_PAUSE_THRESHOLD;
  db.updateOutboundEventWebhook(record.id, {
    consecutiveFailures: failures,
    lastDeliveryAt: now,
    lastStatus: last.status,
    lastError: last.ok ? undefined : last.reason ?? `http_${last.status ?? 'unknown'}`,
    deliveryCount: record.deliveryCount + 1,
    isActive: pausing ? false : record.isActive,
  });
  if (pausing) {
    log.warn('outbound_event_webhook_auto_paused', {
      subscriptionId: record.id,
      consecutiveFailures: failures,
    });
  }
  return {
    subscriptionId: record.id,
    ok: last.ok,
    status: last.status,
    reason: last.reason,
  };
};

/**
 * Fan an event out to every active subscription owned by `event.blackoutUserId`
 * that's filtering for this event type. Production event sources call this
 * directly; the service unwraps the encrypted-at-rest signing secret per
 * subscription, signs the body, and delivers.
 *
 * Errors are reported per-subscription and never thrown — a failing
 * webhook must not block the originating event.
 */
export const dispatchEvent = async (
  event: BlackoutEvent,
  options: DeliverOptions = {},
): Promise<DeliveryReport[]> => {
  // Push the same event to every identified OBS-WS surface for this
  // creator BEFORE the webhook fan-out. Companion / Stream Deck tiles
  // re-render on receipt; doing this first keeps the deck-side latency
  // low even when the outbound webhook receivers are slow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void import('../integrations/obs-ws-compat/server').then((m: any) => {
    try {
      m.notifyBlackoutEvent(event.blackoutUserId, event.type, event.data);
    } catch (err) {
      log.warn('outbound_event_obs_ws_notify_threw', {
        type: event.type,
        error: String(err),
      });
    }
  });

  const candidates = db
    .listActiveOutboundEventWebhooks()
    .filter((r) => r.blackoutUserId === event.blackoutUserId && matchesEventType(r, event.type));

  const reports: DeliveryReport[] = [];
  for (const record of candidates) {
    try {
      const report = await deliverToSubscription(record, event, options);
      reports.push(report);
    } catch (err) {
      log.warn('outbound_event_webhook_dispatch_threw', {
        subscriptionId: record.id,
        eventType: event.type,
        error: String(err),
      });
      reports.push({
        subscriptionId: record.id,
        ok: false,
        reason: `threw: ${(err as Error)?.message ?? String(err)}`,
      });
    }
  }
  return reports;
};

export const __test__ = {
  matchesEventType,
  VALID_EVENT_TYPES,
  FAILURE_PAUSE_THRESHOLD,
  aadFor,
};
