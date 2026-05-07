/**
 * Pure parser for Kick's chat-WS protocol. Kick rides Pusher v7 over
 * WebSocket; every frame is a JSON object with:
 *
 *   { event: string, data?: string | object, channel?: string }
 *
 * `data` is sometimes a JSON-encoded STRING (Pusher's idiosyncrasy)
 * and sometimes already an object. We unwrap it lazily so callers can
 * branch on `event` first and only parse data when needed.
 *
 * No I/O, no socket — just bytes-in, structures-out, so the unit tests
 * are cheap and the connection manager can be reasoned about
 * separately.
 */

export interface PusherFrame {
  event: string;
  /** Either a parsed JSON object or a string (for non-JSON payloads). */
  data?: unknown;
  /** Channel id when the event is bound to a subscription. */
  channel?: string;
}

/**
 * Parse a single Pusher frame from a raw WS message string. Returns null
 * for malformed input; unwraps the `data` field if it's a JSON string.
 */
export const parsePusherFrame = (input: string): PusherFrame | null => {
  if (typeof input !== 'string' || input.length === 0) return null;
  let outer: Record<string, unknown>;
  try {
    outer = JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
  const event = typeof outer.event === 'string' ? outer.event : null;
  if (!event) return null;
  let data: unknown = outer.data;
  if (typeof data === 'string') {
    // Lazily parse: many Pusher events use a string-encoded `data`.
    try {
      data = JSON.parse(data);
    } catch {
      // Leave as-is — some Pusher events (e.g. pusher:ping) use raw strings.
    }
  }
  return {
    event,
    data,
    channel: typeof outer.channel === 'string' ? outer.channel : undefined,
  };
};

// ----------------------------- typed projections -----------------------------

export interface KickChatMessageEvent {
  id: string;
  chatroomId: string;
  content: string;
  type: string;
  createdAt: string;
  senderId: string;
  senderUsername: string;
  senderSlug?: string;
  senderColor?: string;
  /** Raw badges array from Pusher; structure varies per Kick subtype. */
  badges?: Array<{ type: string; text?: string; count?: number }>;
}

interface RawKickChatMessage {
  id?: string | number;
  chatroom_id?: string | number;
  content?: string;
  type?: string;
  created_at?: string;
  sender?: {
    id?: string | number;
    username?: string;
    slug?: string;
    identity?: {
      color?: string;
      badges?: Array<{ type?: string; text?: string; count?: number }>;
    };
  };
}

/**
 * Project a Pusher frame whose event is `App\Events\ChatMessageEvent`
 * into our normalized shape. Returns null when the frame's event isn't
 * a chat message OR the data shape is too sparse to act on.
 */
export const toKickChatMessage = (
  frame: PusherFrame,
): KickChatMessageEvent | null => {
  if (frame.event !== 'App\\Events\\ChatMessageEvent') return null;
  const data = frame.data as RawKickChatMessage | undefined;
  if (!data) return null;
  if (!data.id || !data.sender?.id) return null;
  const badges = data.sender?.identity?.badges
    ?.filter((b): b is { type: string; text?: string; count?: number } => Boolean(b?.type))
    .map((b) => ({ type: b.type!, text: b.text, count: b.count }));
  return {
    id: String(data.id),
    chatroomId: data.chatroom_id !== undefined ? String(data.chatroom_id) : '',
    content: typeof data.content === 'string' ? data.content : '',
    type: data.type ?? 'message',
    createdAt: data.created_at ?? new Date().toISOString(),
    senderId: String(data.sender.id),
    senderUsername: data.sender.username ?? 'unknown',
    senderSlug: data.sender.slug,
    senderColor: data.sender.identity?.color,
    badges,
  };
};

// ----------------------------- frame builders -----------------------------

/** Subscribe message for a Kick chatroom: `chatrooms.<id>.v2`. */
export const buildSubscribeFrame = (chatroomId: string): string =>
  JSON.stringify({
    event: 'pusher:subscribe',
    data: { auth: '', channel: `chatrooms.${chatroomId}.v2` },
  });

/** Pong response for Pusher's keepalive ping. */
export const PUSHER_PONG_FRAME = JSON.stringify({ event: 'pusher:pong', data: {} });
