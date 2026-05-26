/**
 * Tiny, focused Helix client. Right now we only need:
 *   - getAppAccessToken() — client_credentials grant; cached with TTL.
 *   - createEventSubSubscription() — POST /helix/eventsub/subscriptions
 *   - deleteEventSubSubscription() — DELETE /helix/eventsub/subscriptions?id=...
 *
 * Fully typed; pluggable `fetch` for tests; surfaces typed outcomes so
 * callers can pattern-match.
 */

import { readTwitchOAuthConfig } from './oauth';
import { withTimeout } from '../http';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const EVENTSUB_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';

export interface AppAccessToken {
  token: string;
  expiresAtMs: number;
}

let cachedToken: AppAccessToken | null = null;
const TOKEN_LEEWAY_MS = 60_000;

export interface HelixDeps {
  fetch?: typeof fetch;
  /** Override clock for tests. */
  now?: () => number;
}

/**
 * Returns an app access token (client_credentials grant), refreshed
 * proactively when within {@link TOKEN_LEEWAY_MS} of expiry. Cached
 * in-process — multi-replica deployments will each refresh independently
 * (acceptable: client_credentials grants are cheap).
 */
export const getAppAccessToken = async (deps: HelixDeps = {}): Promise<AppAccessToken> => {
  const fetchFn = withTimeout(deps.fetch ?? fetch);
  const now = deps.now ? deps.now() : Date.now();
  if (cachedToken && cachedToken.expiresAtMs - now > TOKEN_LEEWAY_MS) {
    return cachedToken;
  }

  const config = readTwitchOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
  });
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Twitch app access token request failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token || typeof json.expires_in !== 'number') {
    throw new Error(`Twitch app access token response was malformed: ${JSON.stringify(json)}`);
  }
  cachedToken = {
    token: json.access_token,
    expiresAtMs: now + json.expires_in * 1000,
  };
  return cachedToken;
};

export const clearAppAccessTokenCache = (): void => {
  cachedToken = null;
};

// ---------------------- EventSub subscription create/delete ----------------------

export interface CreateEventSubInput {
  type: string;
  version: string;
  /** Twitch's `condition` object — varies per type. */
  condition: Record<string, string>;
  /** The full webhook callback URL Twitch should POST notifications to. */
  callbackUrl: string;
  /** HMAC secret Twitch will sign deliveries with. 10-100 ASCII chars. */
  secret: string;
}

export interface CreatedEventSubSubscription {
  id: string;
  status: string;
  type: string;
  version: string;
  cost: number;
}

export type CreateEventSubOutcome =
  | { kind: 'ok'; subscription: CreatedEventSubSubscription }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden'; detail: string }
  | { kind: 'conflict'; detail: string }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'failed'; status: number; detail: string };

export const createEventSubSubscription = async (
  input: CreateEventSubInput,
  deps: HelixDeps = {},
): Promise<CreateEventSubOutcome> => {
  const fetchFn = withTimeout(deps.fetch ?? fetch);
  const config = readTwitchOAuthConfig();
  const token = await getAppAccessToken(deps);
  const res = await fetchFn(EVENTSUB_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token.token}`,
      'client-id': config.clientId,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: input.type,
      version: input.version,
      condition: input.condition,
      transport: {
        method: 'webhook',
        callback: input.callbackUrl,
        secret: input.secret,
      },
    }),
  });
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 403) {
    const detail = await res.text().catch(() => '');
    return { kind: 'forbidden', detail };
  }
  if (res.status === 409) {
    const detail = await res.text().catch(() => '');
    return { kind: 'conflict', detail };
  }
  if (res.status === 429) {
    const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
    return {
      kind: 'rate_limited',
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
    };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { kind: 'failed', status: res.status, detail };
  }
  const json = (await res.json()) as {
    data?: Array<CreatedEventSubSubscription>;
  };
  const sub = json.data?.[0];
  if (!sub?.id) {
    return { kind: 'failed', status: res.status, detail: 'missing data[0].id' };
  }
  return { kind: 'ok', subscription: sub };
};

export type DeleteEventSubOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'unauthorized' }
  | { kind: 'failed'; status: number; detail: string };

export const deleteEventSubSubscription = async (
  helixSubscriptionId: string,
  deps: HelixDeps = {},
): Promise<DeleteEventSubOutcome> => {
  const fetchFn = withTimeout(deps.fetch ?? fetch);
  const config = readTwitchOAuthConfig();
  const token = await getAppAccessToken(deps);
  const url = `${EVENTSUB_URL}?id=${encodeURIComponent(helixSubscriptionId)}`;
  const res = await fetchFn(url, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${token.token}`,
      'client-id': config.clientId,
    },
  });
  if (res.status === 204) return { kind: 'ok' };
  if (res.status === 404) return { kind: 'not_found' };
  if (res.status === 401) return { kind: 'unauthorized' };
  const detail = await res.text().catch(() => '');
  return { kind: 'failed', status: res.status, detail };
};
