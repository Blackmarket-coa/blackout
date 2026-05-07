import type { YouTubeChatMessage } from './api';

/**
 * Mapper from a YouTube live chat message into:
 *   - `NormalizedYoutubeChatMessage` — the wire shape forwarded into the
 *     bus (and reusable by alerts later if we ever surface SuperChat as
 *     a donation alert), and
 *   - `MatrixForwardedMessageFromYoutube` — the exact Matrix
 *     m.room.message content to send into the bridged den room. Carries
 *     the `m.blackout.origin = 'youtube'` field that the client renders
 *     as the origin badge in the chat pane.
 *
 * Parallel to the Twitch chatBridge module by design: keeps the per-
 * platform projection isolated so adding a third source (Discord, Kick,
 * etc.) stays a single new file.
 *
 * No I/O. Pure transformation; trivially testable.
 */

export interface NormalizedYoutubeChatMessage {
  origin: 'youtube';
  /** YouTube channel id of the broadcast the message belongs to (broadcaster). */
  channel: string;
  /** YouTube channel id of the message author. */
  authorChannelId: string;
  authorDisplayName: string;
  /** Plain-text body. */
  body: string;
  /** Optional URL to the author's avatar; passed through from authorDetails. */
  authorAvatarUrl?: string;
  isOwner: boolean;
  isModerator: boolean;
  /** YouTube channel-membership flag. Mirrors the snippet.authorDetails field. */
  isSponsor: boolean;
  isVerified: boolean;
  /** Message id from YouTube — used as Matrix txn id for dedup. */
  platformMessageId: string;
  /** ms-since-epoch timestamp from snippet.publishedAt. */
  sentAtMs: number;
  /** Raw snippet.type so callers can branch on superChat / sticker / system events. */
  snippetType: string;
  /** SuperChat amount string (e.g. "$5.00") when the message is a paid event. */
  superChatAmountDisplay?: string;
}

const parseTimestamp = (raw?: string): number => {
  if (!raw) return Date.now();
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Date.now();
};

const extractBody = (msg: YouTubeChatMessage, broadcasterChannelId: string): string => {
  const snippet = msg.snippet;
  if (snippet.displayMessage) return snippet.displayMessage;
  if (snippet.textMessageDetails?.messageText) return snippet.textMessageDetails.messageText;
  if (snippet.superChatDetails?.userComment) return snippet.superChatDetails.userComment;
  // System / event messages have no body; surface a brief description so
  // the Matrix render isn't a blank line.
  if (snippet.type !== 'textMessageEvent') {
    return `[${snippet.type}]`;
  }
  void broadcasterChannelId; // unused; kept for symmetry with the call site
  return '';
};

/**
 * Project a YouTube chat API message into our normalized shape.
 *
 * @param msg the raw API message
 * @param broadcasterChannelId the YouTube channel id we're bridging from
 *   (we don't trust the API response to disclose it; the caller passes it)
 */
export const toNormalizedYoutubeChatMessage = (
  msg: YouTubeChatMessage,
  broadcasterChannelId: string,
): NormalizedYoutubeChatMessage => ({
  origin: 'youtube',
  channel: broadcasterChannelId,
  authorChannelId: msg.authorDetails.channelId,
  authorDisplayName: msg.authorDetails.displayName,
  body: extractBody(msg, broadcasterChannelId),
  authorAvatarUrl: msg.authorDetails.profileImageUrl,
  isOwner: Boolean(msg.authorDetails.isChatOwner),
  isModerator: Boolean(msg.authorDetails.isChatModerator),
  isSponsor: Boolean(msg.authorDetails.isChatSponsor),
  isVerified: Boolean(msg.authorDetails.isVerified),
  platformMessageId: msg.id,
  sentAtMs: parseTimestamp(msg.snippet.publishedAt),
  snippetType: msg.snippet.type,
  superChatAmountDisplay: msg.snippet.superChatDetails?.amountDisplayString,
});

// ----------------------------- Matrix mapping -----------------------------

/**
 * Subset of the Matrix m.room.message content we ship for YouTube messages.
 * Mirrors the Twitch shape so the client renderer's existing
 * `m.blackout.*` handling Just Works for YouTube too.
 */
export interface MatrixForwardedMessageFromYoutube {
  msgtype: 'm.text' | 'm.notice';
  body: string;
  format: 'org.matrix.custom.html';
  formatted_body: string;
  'm.blackout.origin': 'youtube';
  'm.blackout.origin_channel': string;
  'm.blackout.origin_user': {
    channel_id: string;
    display_name: string;
    avatar_url?: string;
    is_owner?: boolean;
    is_moderator?: boolean;
    is_sponsor?: boolean;
    is_verified?: boolean;
  };
  'm.blackout.origin_message_id': string;
  'm.blackout.origin_sent_at_ms': number;
  /** Snippet type when it's not a plain textMessageEvent — drives alert UI. */
  'm.blackout.origin_snippet_type'?: string;
  /** SuperChat amount surfaced for richer overlays. */
  'm.blackout.origin_superchat_amount_display'?: string;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const toMatrixForwardedMessage = (
  message: NormalizedYoutubeChatMessage,
): MatrixForwardedMessageFromYoutube => {
  const safeName = escapeHtml(message.authorDisplayName);
  const safeBody = escapeHtml(message.body);
  // SuperChat / system-type events render as m.notice (greyer rendering
  // in clients with role-aware styling); plain text uses m.text.
  const isPlainText = message.snippetType === 'textMessageEvent';
  const plainPrefix = `[youtube] ${message.authorDisplayName}: `;
  const htmlPrefix = `<b>${safeName}</b>: `;

  const content: MatrixForwardedMessageFromYoutube = {
    msgtype: isPlainText ? 'm.text' : 'm.notice',
    body: `${plainPrefix}${message.body}`,
    format: 'org.matrix.custom.html',
    formatted_body: `<span data-mx-blackout-origin="youtube">${htmlPrefix}${safeBody}</span>`,
    'm.blackout.origin': 'youtube',
    'm.blackout.origin_channel': message.channel,
    'm.blackout.origin_user': {
      channel_id: message.authorChannelId,
      display_name: message.authorDisplayName,
      avatar_url: message.authorAvatarUrl,
      is_owner: message.isOwner || undefined,
      is_moderator: message.isModerator || undefined,
      is_sponsor: message.isSponsor || undefined,
      is_verified: message.isVerified || undefined,
    },
    'm.blackout.origin_message_id': message.platformMessageId,
    'm.blackout.origin_sent_at_ms': message.sentAtMs,
  };
  if (!isPlainText) content['m.blackout.origin_snippet_type'] = message.snippetType;
  if (message.superChatAmountDisplay) {
    content['m.blackout.origin_superchat_amount_display'] = message.superChatAmountDisplay;
  }
  return content;
};

export const __test__ = { escapeHtml, parseTimestamp, extractBody };
