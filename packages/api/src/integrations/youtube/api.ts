/**
 * Tiny YouTube Data API v3 client. Today we need exactly two endpoints
 * for Live chat ingress:
 *
 *   - GET /youtube/v3/liveBroadcasts?broadcastStatus=active  → discover
 *     the activeLiveChatId for the linked channel's current broadcast.
 *   - GET /youtube/v3/liveChat/messages?liveChatId=...&pageToken=...  →
 *     poll messages with cursor pagination. Response carries the
 *     `nextPageToken` we persist as the bridge's sync_cursor + a
 *     `pollingIntervalMillis` we respect.
 *
 * Auth: user-OAuth Bearer token from a linked YouTube account
 * (refreshed by the existing oauthProviders.ensureFreshAccessToken
 * pipeline). The youtube.readonly scope is sufficient for both reads.
 */

import { withTimeout } from '../http';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeBroadcast {
  id: string;
  snippet: {
    title?: string;
    /** The id we hand to liveChatMessages.list. */
    liveChatId?: string;
  };
}

export interface YouTubeChatMessage {
  id: string;
  snippet: {
    type: string;
    publishedAt: string;
    /** Plain-text body. Only set for textMessageEvent / superChatEvent / etc. */
    displayMessage?: string;
    textMessageDetails?: { messageText?: string };
    superChatDetails?: { amountDisplayString?: string; userComment?: string; tier?: number };
    superStickerDetails?: { amountDisplayString?: string; tier?: number };
  };
  authorDetails: {
    channelId: string;
    displayName: string;
    profileImageUrl?: string;
    isVerified?: boolean;
    isChatOwner?: boolean;
    isChatModerator?: boolean;
    isChatSponsor?: boolean;
  };
}

export interface ListChatMessagesPage {
  items: YouTubeChatMessage[];
  nextPageToken?: string;
  /** YouTube's recommended next-poll delay. Schedulers should respect this. */
  pollingIntervalMillis?: number;
}

export interface YoutubeApiDeps {
  fetch?: typeof fetch;
}

export type ListBroadcastsOutcome =
  | { kind: 'ok'; broadcast: YouTubeBroadcast | null }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'failed'; status: number; detail: string };

const handleErrors = async (
  res: Response,
): Promise<{ kind: 'unauthorized' } | { kind: 'rate_limited'; retryAfterSeconds?: number } | { kind: 'failed'; status: number; detail: string } | null> => {
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 403) {
    // 403 is most often the YouTube quota-exceeded code; surface to caller.
    const detail = await res.text().catch(() => '');
    if (detail.includes('quotaExceeded') || detail.includes('rateLimitExceeded')) {
      return { kind: 'rate_limited', retryAfterSeconds: undefined };
    }
    return { kind: 'failed', status: 403, detail };
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
  return null;
};

/**
 * Find the currently-active broadcast for the authenticated user. Returns
 * null when the user has no live broadcast. Failures map to typed
 * outcomes so callers can decide (refresh token / back off / give up).
 */
export const findActiveLiveBroadcast = async (
  accessToken: string,
  deps: YoutubeApiDeps = {},
): Promise<ListBroadcastsOutcome> => {
  const fetchFn = withTimeout(deps.fetch ?? fetch);
  const url = `${BASE_URL}/liveBroadcasts?part=snippet&broadcastStatus=active&maxResults=5`;
  const res = await fetchFn(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const err = await handleErrors(res);
  if (err) return err;
  const json = (await res.json()) as { items?: YouTubeBroadcast[] };
  const broadcast = json.items?.find((b) => b.snippet?.liveChatId) ?? null;
  return { kind: 'ok', broadcast };
};

export type ListChatMessagesOutcome =
  | { kind: 'ok'; page: ListChatMessagesPage }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'failed'; status: number; detail: string };

export interface ListChatMessagesOptions {
  liveChatId: string;
  /** Cursor from the previous page; first call passes nothing. */
  pageToken?: string;
  /** Max items per page (cap is 2000). */
  maxResults?: number;
  fetch?: typeof fetch;
}

export const listLiveChatMessages = async (
  accessToken: string,
  options: ListChatMessagesOptions,
): Promise<ListChatMessagesOutcome> => {
  const fetchFn = withTimeout(options.fetch ?? fetch);
  const params = new URLSearchParams({
    liveChatId: options.liveChatId,
    part: 'snippet,authorDetails',
  });
  if (options.pageToken) params.set('pageToken', options.pageToken);
  if (options.maxResults !== undefined) params.set('maxResults', String(options.maxResults));
  const res = await fetchFn(`${BASE_URL}/liveChat/messages?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const err = await handleErrors(res);
  if (err) return err;
  const json = (await res.json()) as ListChatMessagesPage;
  return {
    kind: 'ok',
    page: {
      items: json.items ?? [],
      nextPageToken: json.nextPageToken,
      pollingIntervalMillis: json.pollingIntervalMillis,
    },
  };
};

// ----------------------------- outbound: liveChatMessages.insert -----------------------------

export interface InsertChatMessageOptions {
  liveChatId: string;
  /** Plain-text message body (≤200 chars per YouTube). */
  body: string;
  fetch?: typeof fetch;
}

export type InsertChatMessageOutcome =
  | { kind: 'ok'; messageId: string }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'failed'; status: number; detail: string };

/**
 * Post a textMessageEvent into the active live chat.
 * Spec: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/insert
 */
export const insertLiveChatMessage = async (
  accessToken: string,
  options: InsertChatMessageOptions,
): Promise<InsertChatMessageOutcome> => {
  const fetchFn = withTimeout(options.fetch ?? fetch);
  const url = `${BASE_URL}/liveChat/messages?part=snippet`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      snippet: {
        type: 'textMessageEvent',
        liveChatId: options.liveChatId,
        textMessageDetails: { messageText: options.body },
      },
    }),
  });
  const err = await handleErrors(res);
  if (err) return err;
  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    return { kind: 'failed', status: res.status, detail: 'missing id in response' };
  }
  return { kind: 'ok', messageId: json.id };
};
