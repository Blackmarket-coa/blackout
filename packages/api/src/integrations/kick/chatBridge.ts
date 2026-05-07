import type { KickChatMessageEvent } from './pusherProtocol';

/**
 * Normalize a Kick chat message into our shared shape and project it
 * into the Matrix `m.room.message` content the bridges forward into the
 * den. Parallel to the Twitch / YouTube chatBridge modules; the
 * `m.blackout.origin = 'kick'` field tells the client renderer how to
 * style the badge.
 *
 * Pure: no I/O, no globals, no time.
 */

export interface NormalizedKickChatMessage {
  origin: 'kick';
  /** Kick chatroom id the message belongs to. */
  chatroomId: string;
  authorId: string;
  authorUsername: string;
  authorSlug?: string;
  authorColor?: string;
  badges?: Array<{ type: string; text?: string; count?: number }>;
  body: string;
  /** Kick raw message type — "message", "reply", "celebration", etc. */
  pusherType: string;
  platformMessageId: string;
  sentAtMs: number;
}

const parseTimestamp = (raw?: string): number => {
  if (!raw) return Date.now();
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Date.now();
};

export const toNormalizedKickChatMessage = (
  event: KickChatMessageEvent,
): NormalizedKickChatMessage => ({
  origin: 'kick',
  chatroomId: event.chatroomId,
  authorId: event.senderId,
  authorUsername: event.senderUsername,
  authorSlug: event.senderSlug,
  authorColor: event.senderColor,
  badges: event.badges,
  body: event.content,
  pusherType: event.type,
  platformMessageId: event.id,
  sentAtMs: parseTimestamp(event.createdAt),
});

// ----------------------------- Matrix mapping -----------------------------

export interface MatrixForwardedMessageFromKick {
  msgtype: 'm.text' | 'm.notice';
  body: string;
  format: 'org.matrix.custom.html';
  formatted_body: string;
  'm.blackout.origin': 'kick';
  'm.blackout.origin_chatroom': string;
  'm.blackout.origin_user': {
    id: string;
    username: string;
    slug?: string;
    color?: string;
    badges?: Array<{ type: string; text?: string; count?: number }>;
  };
  'm.blackout.origin_message_id': string;
  'm.blackout.origin_sent_at_ms': number;
  /** Pusher event subtype when not a plain "message". */
  'm.blackout.origin_pusher_type'?: string;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const toMatrixForwardedMessage = (
  message: NormalizedKickChatMessage,
): MatrixForwardedMessageFromKick => {
  const safeName = escapeHtml(message.authorUsername);
  const safeBody = escapeHtml(message.body);
  const isPlain = message.pusherType === 'message' || message.pusherType === 'reply';
  const plainPrefix = `[kick] ${message.authorUsername}: `;
  const htmlPrefix = message.authorColor
    ? `<font color="${escapeHtml(message.authorColor)}"><b>${safeName}</b></font>: `
    : `<b>${safeName}</b>: `;
  const content: MatrixForwardedMessageFromKick = {
    msgtype: isPlain ? 'm.text' : 'm.notice',
    body: `${plainPrefix}${message.body}`,
    format: 'org.matrix.custom.html',
    formatted_body: `<span data-mx-blackout-origin="kick">${htmlPrefix}${safeBody}</span>`,
    'm.blackout.origin': 'kick',
    'm.blackout.origin_chatroom': message.chatroomId,
    'm.blackout.origin_user': {
      id: message.authorId,
      username: message.authorUsername,
      slug: message.authorSlug,
      color: message.authorColor,
      badges: message.badges?.length ? message.badges : undefined,
    },
    'm.blackout.origin_message_id': message.platformMessageId,
    'm.blackout.origin_sent_at_ms': message.sentAtMs,
  };
  if (!isPlain) content['m.blackout.origin_pusher_type'] = message.pusherType;
  return content;
};

export const __test__ = { escapeHtml, parseTimestamp };
