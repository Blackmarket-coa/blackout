/**
 * Pure parser for Twitch IRCv3 chat lines (the WSS endpoint at
 * irc-ws.chat.twitch.tv speaks the same wire format as the TCP IRC).
 *
 * Twitch lines look like:
 *
 *   @badge-info=;badges=moderator/1;color=#1E90FF;display-name=Cory;\
 *   emotes=25:0-4;flags=;id=...;mod=1;room-id=42;subscriber=0;\
 *   tmi-sent-ts=1700000000000;user-id=99 \
 *   :cory!cory@cory.tmi.twitch.tv PRIVMSG #blackoutdev :Kappa hello
 *
 * The parser is intentionally tolerant: unknown commands round-trip into
 * `IrcLine.command` so callers can introspect; unknown tags are kept on
 * the parsed line.
 *
 * Reference: https://dev.twitch.tv/docs/irc/
 *
 * No I/O, no side effects, no dependencies — keeps the unit tests cheap
 * and means the WS layer can be reasoned about independently.
 */

export interface IrcPrefix {
  /** "nick" portion of `:nick!user@host`. May equal nick on Twitch. */
  nick?: string;
  /** "user" portion (rare on Twitch — usually equals nick). */
  user?: string;
  /** "host" portion. */
  host?: string;
  /** Raw prefix without the leading colon. */
  raw: string;
}

export interface IrcLine {
  /** Tag map from the leading `@`-block. Empty object if no tags. */
  tags: Record<string, string>;
  prefix?: IrcPrefix;
  /** UPPERCASED command verb (PRIVMSG, PING, USERNOTICE, ...). */
  command: string;
  /** Middle params after the command, before the trailing param. */
  params: string[];
  /** Trailing param (everything after the first `:` past the command). */
  trailing?: string;
  /** The raw line as received, for debugging / replay. */
  raw: string;
}

/**
 * Twitch escapes a small set of characters in tag values. Per the IRCv3
 * message-tags spec: `;` → `\:`, ` ` → `\s`, `\` → `\\`, CR → `\r`, LF → `\n`.
 * (Yes, semicolons map to `\:` not `\;` — that's the spec.)
 */
const unescapeTagValue = (raw: string): string =>
  raw.replace(/\\(s|:|r|n|\\)/g, (_match, esc: string) => {
    switch (esc) {
      case 's':
        return ' ';
      case ':':
        return ';';
      case 'r':
        return '\r';
      case 'n':
        return '\n';
      case '\\':
      default:
        return '\\';
    }
  });

const parseTags = (block: string): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!block) return out;
  for (const piece of block.split(';')) {
    if (!piece) continue;
    const eq = piece.indexOf('=');
    if (eq < 0) {
      out[piece] = '';
      continue;
    }
    const key = piece.slice(0, eq);
    const value = piece.slice(eq + 1);
    out[key] = unescapeTagValue(value);
  }
  return out;
};

const parsePrefix = (raw: string): IrcPrefix => {
  // raw is the prefix WITHOUT the leading colon: "nick!user@host" or "host"
  const exclam = raw.indexOf('!');
  const at = raw.indexOf('@');
  if (exclam < 0 && at < 0) return { raw, host: raw };
  let nick: string | undefined;
  let user: string | undefined;
  let host: string | undefined;
  if (exclam >= 0) {
    nick = raw.slice(0, exclam);
    if (at > exclam) {
      user = raw.slice(exclam + 1, at);
      host = raw.slice(at + 1);
    } else {
      user = raw.slice(exclam + 1);
    }
  } else if (at >= 0) {
    nick = raw.slice(0, at);
    host = raw.slice(at + 1);
  }
  return { raw, nick, user, host };
};

/**
 * Parse a single IRC line. Strips trailing CR/LF if present. Returns null
 * for empty input. Throws never — malformed lines round-trip with whatever
 * structure was extractable (callers can inspect `command` to decide).
 */
export const parseIrcLine = (input: string): IrcLine | null => {
  if (typeof input !== 'string') return null;
  let line = input;
  // Twitch-WSS ships individual lines per frame; some clients split on \r\n.
  // Trim safely.
  line = line.replace(/[\r\n]+$/, '');
  if (line.length === 0) return null;

  const raw = line;

  // Tag block?
  let tags: Record<string, string> = {};
  if (line.startsWith('@')) {
    const space = line.indexOf(' ');
    if (space < 0) {
      // Malformed: tags but no command. Keep going with the raw line as command.
      return { tags: parseTags(line.slice(1)), command: '', params: [], raw };
    }
    tags = parseTags(line.slice(1, space));
    line = line.slice(space + 1);
  }

  // Prefix?
  let prefix: IrcPrefix | undefined;
  if (line.startsWith(':')) {
    const space = line.indexOf(' ');
    if (space < 0) {
      return { tags, prefix: parsePrefix(line.slice(1)), command: '', params: [], raw };
    }
    prefix = parsePrefix(line.slice(1, space));
    line = line.slice(space + 1);
  }

  // Command + params + trailing.
  let trailing: string | undefined;
  const trailingMarker = line.indexOf(' :');
  if (trailingMarker >= 0) {
    trailing = line.slice(trailingMarker + 2);
    line = line.slice(0, trailingMarker);
  }
  const tokens = line.split(' ').filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return { tags, prefix, command: '', params: [], trailing, raw };
  }
  const [command, ...params] = tokens;
  return { tags, prefix, command: command.toUpperCase(), params, trailing, raw };
};

/**
 * Split a raw WS message that may contain one or more `\r\n`-separated lines
 * into individual IrcLine objects. Twitch occasionally batches PING + USERSTATE
 * into a single frame, especially right after JOIN.
 */
export const parseIrcFrame = (frame: string): IrcLine[] => {
  if (typeof frame !== 'string' || frame.length === 0) return [];
  return frame
    .split(/\r?\n/)
    .map(parseIrcLine)
    .filter((line): line is IrcLine => line !== null);
};

// ----------------- typed projections of common commands -----------------

export interface PrivmsgEvent {
  kind: 'privmsg';
  channel: string;
  nick: string;
  /** Message body (may include /me action prefix when `isAction` is true). */
  body: string;
  /** True when the message was sent via the `/me` action. */
  isAction: boolean;
  displayName?: string;
  color?: string;
  /** Raw badges tag, e.g. `moderator/1,subscriber/12`. */
  badges?: string;
  /** Numeric Twitch user id, if present in tags. */
  twitchUserId?: string;
  /** Numeric Twitch channel id, if present in tags. */
  twitchRoomId?: string;
  /** ms-since-epoch timestamp from the `tmi-sent-ts` tag (or fallback Date.now). */
  sentAtMs: number;
  /** Twitch message id (`id` tag), used for moderation correlation. */
  messageId?: string;
  /** True when the `mod` tag is `1`. */
  isMod: boolean;
  /** True when the `subscriber` tag is `1`. */
  isSubscriber: boolean;
  /** Bits amount when the message was a cheer; otherwise 0. */
  bits: number;
  /** Reply-parent message id when this message is a reply. */
  replyParentId?: string;
}

const ACTION_PREFIX = 'ACTION ';
const ACTION_SUFFIX = '';

const stripCtcpAction = (body: string): { body: string; isAction: boolean } => {
  if (body.startsWith(ACTION_PREFIX) && body.endsWith(ACTION_SUFFIX)) {
    return {
      body: body.slice(ACTION_PREFIX.length, body.length - ACTION_SUFFIX.length),
      isAction: true,
    };
  }
  return { body, isAction: false };
};

/**
 * Project a PRIVMSG IrcLine into a normalized PrivmsgEvent. Returns null for
 * non-PRIVMSG commands or malformed PRIVMSGs (no channel param / no trailing
 * body).
 */
export const toPrivmsg = (line: IrcLine): PrivmsgEvent | null => {
  if (line.command !== 'PRIVMSG') return null;
  const channel = line.params[0];
  if (!channel || !channel.startsWith('#')) return null;
  if (typeof line.trailing !== 'string') return null;
  const nick = line.prefix?.nick;
  if (!nick) return null;

  const tsRaw = line.tags['tmi-sent-ts'];
  const sentAtMs = (() => {
    if (!tsRaw) return Date.now();
    const n = Number(tsRaw);
    return Number.isFinite(n) && n > 0 ? n : Date.now();
  })();

  const bitsRaw = line.tags.bits;
  const bits = bitsRaw ? Math.max(0, Number.parseInt(bitsRaw, 10) || 0) : 0;

  const { body, isAction } = stripCtcpAction(line.trailing);

  return {
    kind: 'privmsg',
    channel: channel.toLowerCase(),
    nick,
    body,
    isAction,
    displayName: line.tags['display-name'] || undefined,
    color: line.tags.color || undefined,
    badges: line.tags.badges || undefined,
    twitchUserId: line.tags['user-id'] || undefined,
    twitchRoomId: line.tags['room-id'] || undefined,
    sentAtMs,
    messageId: line.tags.id || undefined,
    isMod: line.tags.mod === '1',
    isSubscriber: line.tags.subscriber === '1',
    bits,
    replyParentId: line.tags['reply-parent-msg-id'] || undefined,
  };
};
