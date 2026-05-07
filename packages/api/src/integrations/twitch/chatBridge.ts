import type { PrivmsgEvent } from './ircParser';

/**
 * Mapper from a parsed Twitch PRIVMSG into:
 *   - `NormalizedChatMessage` — the wire-shape Track A's `normalizedChat`
 *     pipeline will consume so YouTube / Kick / TikTok ingress all share a
 *     downstream code path; and
 *   - `MatrixForwardedMessage` — the exact `m.room.message` event content
 *     to send into the Blackout den room. Carries the
 *     `m.blackout.origin = 'twitch'` field that the client side renders as
 *     the origin badge in the chat pane.
 *
 * No I/O. No timers. No globals. Pure transformation so we can unit-test
 * the contract without standing up a real WS or Matrix client.
 */

export interface NormalizedChatMessage {
  origin: 'twitch';
  /** Lowercased Twitch channel login (without the leading `#`). */
  channel: string;
  /** Username on the source platform. */
  authorLogin: string;
  /** Display name on the source platform, when present. */
  authorDisplayName?: string;
  /** Stable id on the source platform (Twitch numeric user id). */
  authorPlatformId?: string;
  /** Twitch hex color, e.g. `#1E90FF`, when set by the user. */
  authorColor?: string;
  /** Parsed badge tuples (`[name, version]`) — empty array when absent. */
  badges: Array<{ name: string; version: string }>;
  body: string;
  isAction: boolean;
  isMod: boolean;
  isSubscriber: boolean;
  bits: number;
  sentAtMs: number;
  /** Twitch's per-message id; used for moderation correlation + dedup. */
  platformMessageId?: string;
  replyParentId?: string;
}

const parseBadges = (raw: string | undefined): Array<{ name: string; version: string }> => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const slash = segment.indexOf('/');
      if (slash < 0) return { name: segment, version: '' };
      return { name: segment.slice(0, slash), version: segment.slice(slash + 1) };
    });
};

/**
 * Strip the leading `#` from an IRC channel name. Twitch channels are
 * always lowercase ASCII, but we lowercase defensively in case future
 * sources ship with mixed case.
 */
export const stripChannelHash = (channel: string): string =>
  (channel.startsWith('#') ? channel.slice(1) : channel).toLowerCase();

export const toNormalizedMessage = (event: PrivmsgEvent): NormalizedChatMessage => ({
  origin: 'twitch',
  channel: stripChannelHash(event.channel),
  authorLogin: event.nick,
  authorDisplayName: event.displayName,
  authorPlatformId: event.twitchUserId,
  authorColor: event.color,
  badges: parseBadges(event.badges),
  body: event.body,
  isAction: event.isAction,
  isMod: event.isMod,
  isSubscriber: event.isSubscriber,
  bits: event.bits,
  sentAtMs: event.sentAtMs,
  platformMessageId: event.messageId,
  replyParentId: event.replyParentId,
});

// ----------------------------- Matrix mapping -----------------------------

/**
 * Subset of the Matrix `m.room.message` event content that we generate.
 * Custom fields under the `m.blackout.*` namespace carry origin metadata so
 * the renderer can show "via Twitch" badges and expose source attribution.
 */
export interface MatrixForwardedMessage {
  /** Matrix message type — always `m.text` (we don't currently emit `m.emote`). */
  msgtype: 'm.text' | 'm.emote';
  /** Plain-text body. */
  body: string;
  /** HTML formatted body (when we had something worth formatting). */
  format?: 'org.matrix.custom.html';
  formatted_body?: string;
  // ---- Blackout-namespaced extension fields ----
  'm.blackout.origin': 'twitch';
  'm.blackout.origin_channel': string;
  'm.blackout.origin_user': {
    login: string;
    display_name?: string;
    platform_id?: string;
    color?: string;
    badges?: Array<{ name: string; version: string }>;
  };
  'm.blackout.origin_message_id'?: string;
  'm.blackout.origin_reply_to'?: string;
  'm.blackout.origin_sent_at_ms': number;
  'm.blackout.origin_bits'?: number;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const toMatrixForwardedMessage = (
  message: NormalizedChatMessage,
): MatrixForwardedMessage => {
  const displayName = message.authorDisplayName ?? message.authorLogin;
  const safeName = escapeHtml(displayName);
  const safeBody = escapeHtml(message.body);
  // The colored display-name prefix is Twitch-style attribution. We render
  // it both in plaintext (for clients without HTML) and HTML so the
  // existing message renderer doesn't need to care this came from Twitch.
  const plainPrefix = `[twitch] ${displayName}: `;
  const htmlPrefix = message.authorColor
    ? `<font color="${escapeHtml(message.authorColor)}"><b>${safeName}</b></font>: `
    : `<b>${safeName}</b>: `;

  const content: MatrixForwardedMessage = {
    msgtype: message.isAction ? 'm.emote' : 'm.text',
    body: `${plainPrefix}${message.body}`,
    format: 'org.matrix.custom.html',
    formatted_body: `<span data-mx-blackout-origin="twitch">${htmlPrefix}${safeBody}</span>`,
    'm.blackout.origin': 'twitch',
    'm.blackout.origin_channel': message.channel,
    'm.blackout.origin_user': {
      login: message.authorLogin,
      display_name: message.authorDisplayName,
      platform_id: message.authorPlatformId,
      color: message.authorColor,
      badges: message.badges.length > 0 ? message.badges : undefined,
    },
    'm.blackout.origin_message_id': message.platformMessageId,
    'm.blackout.origin_reply_to': message.replyParentId,
    'm.blackout.origin_sent_at_ms': message.sentAtMs,
  };
  if (message.bits > 0) content['m.blackout.origin_bits'] = message.bits;
  return content;
};

export const __test__ = { parseBadges, escapeHtml };
