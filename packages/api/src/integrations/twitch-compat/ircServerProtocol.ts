/**
 * Phase 2 / Track B: Twitch-IRC-compatible server protocol layer.
 *
 * Pure functions and a tiny state machine. NO socket handling — the
 * future WS/TCP server feeds us inbound lines and ships our outbound
 * lines on the wire. Keeping the protocol layer transport-free means we
 * can unit-test the bot-handshake matrix exhaustively without plumbing.
 *
 * Reference (Twitch IRC):
 *   https://dev.twitch.tv/docs/irc/
 *
 * Wire shape we mimic:
 *   < CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands
 *   > :tmi.twitch.tv CAP * ACK :twitch.tv/membership twitch.tv/tags twitch.tv/commands
 *   < PASS oauth:<bearer>
 *   < NICK <bot_login>
 *   > :tmi.twitch.tv 001 <bot_login> :Welcome, GLHF!
 *   > :tmi.twitch.tv 002/003/004/375/372/376 (motd-ish)
 *   < JOIN #<channel>
 *   > :<bot>!<bot>@<bot>.tmi.twitch.tv JOIN #<channel>
 *   > :<bot>.tmi.twitch.tv 353 <bot> = #<channel> :<bot>
 *   > :<bot>.tmi.twitch.tv 366 <bot> #<channel> :End of /NAMES list
 *   < PRIVMSG #<channel> :<body>
 *   < PING :tmi.twitch.tv
 *   > PONG :tmi.twitch.tv
 *
 * On the SERVER side (us), we translate the bot's PRIVMSG into Matrix
 * sends and we serialize Matrix-room messages into PRIVMSG lines that
 * we ship to the bot. The translation glue lives outside this file;
 * here we expose the parser/serializer + handshake state.
 */

export const SERVER_HOST = 'tmi.twitch.tv' as const;

// Twitch IRCv3 caps the server advertises support for.
export const SUPPORTED_CAPS = [
  'twitch.tv/membership',
  'twitch.tv/tags',
  'twitch.tv/commands',
] as const;

export type Cap = (typeof SUPPORTED_CAPS)[number];

// --------------------------- parser -----------------------------------------

export interface ParsedIrcLine {
  /** `@key=value;key2=value2` IRCv3 message tags, parsed into a map. */
  tags: Record<string, string>;
  /** The `:prefix` portion (sender) without the leading colon. */
  prefix?: string;
  /** Command word (e.g. `PRIVMSG`, `JOIN`, `001`). Always uppercased. */
  command: string;
  /** Middle params plus a final `:trailing` collapsed into a single array. */
  params: string[];
}

const parseTags = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const segment of raw.split(';')) {
    if (!segment) continue;
    const eq = segment.indexOf('=');
    if (eq < 0) {
      out[segment] = '';
    } else {
      out[segment.slice(0, eq)] = unescapeTagValue(segment.slice(eq + 1));
    }
  }
  return out;
};

// IRCv3 tag value escaping: \: \s \\ \r \n.
const TAG_UNESCAPE: Record<string, string> = {
  ':': ';',
  s: ' ',
  '\\': '\\',
  r: '\r',
  n: '\n',
};
const unescapeTagValue = (raw: string): string =>
  raw.replace(/\\(.)/g, (_, ch: string) =>
    TAG_UNESCAPE[ch] !== undefined ? TAG_UNESCAPE[ch] : ch,
  );
const escapeTagValue = (raw: string): string =>
  raw
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\:')
    .replace(/ /g, '\\s')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');

/**
 * Parse one IRC line, returning null if the line is malformed in a way
 * we should ignore rather than disconnect over (Twitch's reference
 * implementation is forgiving).
 */
export const parseIrcLine = (line: string): ParsedIrcLine | null => {
  const trimmed = line.replace(/\r$/, '').trim();
  if (!trimmed) return null;
  let rest = trimmed;
  let tags: Record<string, string> = {};
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    if (sp < 0) return null;
    tags = parseTags(rest.slice(1, sp));
    rest = rest.slice(sp + 1).trimStart();
  }
  let prefix: string | undefined;
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ');
    if (sp < 0) return null;
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1).trimStart();
  }
  // Command + params. `:trailing` swallows the rest including spaces.
  const params: string[] = [];
  let command = '';
  // Walk tokens.
  while (rest.length > 0) {
    if (rest.startsWith(':')) {
      params.push(rest.slice(1));
      break;
    }
    const sp = rest.indexOf(' ');
    if (sp < 0) {
      if (!command) command = rest;
      else params.push(rest);
      break;
    }
    const tok = rest.slice(0, sp);
    if (!command) command = tok;
    else params.push(tok);
    rest = rest.slice(sp + 1).trimStart();
  }
  if (!command) return null;
  return { tags, prefix, command: command.toUpperCase(), params };
};

// --------------------------- serializer -------------------------------------

export interface SerializeOptions {
  tags?: Record<string, string>;
  prefix?: string;
  command: string;
  /** Middle params, written without the trailing-marker `:`. */
  params?: string[];
  /**
   * Explicit trailing param (always emitted as `:value`). Use for PRIVMSG
   * bodies, NUMERIC reply text, NOTICE text, and any token bots gate on
   * being a trailing — even single-word ones like NICK on a 353 NAMES line.
   */
  trailing?: string;
}

/**
 * Build an IRC line. Trailing marker is explicit via `trailing`; we don't
 * try to auto-detect from content because Twitch bots gate on specific
 * lines having a `:` even when the value is single-token (e.g. 353 NAMES
 * ends with `:nick`).
 */
export const serializeIrcLine = (msg: SerializeOptions): string => {
  const parts: string[] = [];
  if (msg.tags && Object.keys(msg.tags).length > 0) {
    const t = Object.entries(msg.tags)
      .map(([k, v]) => (v === '' ? k : `${k}=${escapeTagValue(v)}`))
      .join(';');
    parts.push(`@${t}`);
  }
  if (msg.prefix) parts.push(`:${msg.prefix}`);
  parts.push(msg.command);
  for (const p of msg.params ?? []) parts.push(p);
  if (msg.trailing !== undefined) parts.push(`:${msg.trailing}`);
  return parts.join(' ');
};

// --------------------------- handshake state machine ------------------------

export interface ConnectionState {
  caps: Set<Cap>;
  passReceived: boolean;
  /** Plaintext bearer the bot supplied via `PASS oauth:<bearer>`. */
  presentedBearer?: string;
  nick?: string;
  authenticated: boolean;
  joinedChannels: Set<string>;
  /**
   * Once the bot has finished CAP negotiation and supplied PASS+NICK we
   * flip this so the future WS server can send the welcome burst.
   */
  registered: boolean;
}

export const initConnectionState = (): ConnectionState => ({
  caps: new Set(),
  passReceived: false,
  authenticated: false,
  joinedChannels: new Set(),
  registered: false,
});

export type ServerEvent =
  /** Send these lines to the bot. */
  | { kind: 'send'; lines: string[] }
  /**
   * The bot just authenticated (PASS+NICK both received and PASS verified).
   * The host should look up the bearer and call onBearerVerified() with the
   * matched user, then call onWelcome() to ship the welcome burst.
   */
  | { kind: 'auth_attempt'; presentedBearer: string; nick: string }
  /** The bot wants to JOIN. Host validates against scope, calls onJoinAccepted/Rejected. */
  | { kind: 'join_request'; channel: string }
  /** The bot sent a PRIVMSG. Host translates to Matrix. */
  | { kind: 'privmsg'; channel: string; body: string; tags: Record<string, string> }
  /** Bot wants to PART (leave). */
  | { kind: 'part_request'; channel: string }
  /** Inbound PING; host should respond with PONG :<server>. */
  | { kind: 'ping'; payload: string }
  /** Bot is closing. */
  | { kind: 'quit'; reason?: string }
  /** Unknown command — we can ignore or log. */
  | { kind: 'unknown'; command: string; params: string[] };

/**
 * Drive one inbound IRC line through the handshake. Returns the events
 * the host should react to (sending lines, looking up bearers, etc.).
 *
 * The state machine is liberal: out-of-order PASS/NICK/CAP all work, in
 * line with bot library behaviour we've observed (twitchdev/twitch-irc).
 */
export const handleInboundLine = (
  state: ConnectionState,
  line: string,
): ServerEvent[] => {
  const parsed = parseIrcLine(line);
  if (!parsed) return [];
  switch (parsed.command) {
    case 'CAP': {
      const sub = parsed.params[0]?.toUpperCase();
      if (sub === 'REQ') {
        const requested = (parsed.params[1] ?? '').split(/\s+/).filter(Boolean);
        const accepted: string[] = [];
        const rejected: string[] = [];
        for (const c of requested) {
          if ((SUPPORTED_CAPS as readonly string[]).includes(c)) {
            state.caps.add(c as Cap);
            accepted.push(c);
          } else rejected.push(c);
        }
        const lines: string[] = [];
        if (accepted.length > 0) {
          lines.push(
            serializeIrcLine({
              prefix: SERVER_HOST,
              command: 'CAP',
              params: ['*', 'ACK'],
              trailing: accepted.join(' '),
            }),
          );
        }
        if (rejected.length > 0) {
          lines.push(
            serializeIrcLine({
              prefix: SERVER_HOST,
              command: 'CAP',
              params: ['*', 'NAK'],
              trailing: rejected.join(' '),
            }),
          );
        }
        return [{ kind: 'send', lines }];
      }
      if (sub === 'LS') {
        return [
          {
            kind: 'send',
            lines: [
              serializeIrcLine({
                prefix: SERVER_HOST,
                command: 'CAP',
                params: ['*', 'LS'],
                trailing: SUPPORTED_CAPS.join(' '),
              }),
            ],
          },
        ];
      }
      // CAP END or anything else: nothing to send; bot proceeds to
      // PASS/NICK at its leisure.
      return [];
    }

    case 'PASS': {
      // `PASS oauth:<bearer>` is the Twitch convention; we accept the
      // bearer with or without the prefix to be liberal.
      const raw = parsed.params[0] ?? '';
      const bearer = raw.startsWith('oauth:') ? raw.slice(6) : raw;
      state.passReceived = true;
      state.presentedBearer = bearer;
      return tryAuth(state);
    }

    case 'NICK': {
      const nick = parsed.params[0] ?? '';
      if (!nick) return [];
      state.nick = nick.toLowerCase();
      return tryAuth(state);
    }

    case 'PING': {
      const payload = parsed.params[0] ?? SERVER_HOST;
      return [
        { kind: 'ping', payload },
        {
          kind: 'send',
          lines: [
            serializeIrcLine({
              prefix: SERVER_HOST,
              command: 'PONG',
              params: [SERVER_HOST],
              trailing: payload,
            }),
          ],
        },
      ];
    }

    case 'JOIN': {
      if (!state.authenticated) {
        return [
          {
            kind: 'send',
            lines: [
              serializeIrcLine({
                prefix: SERVER_HOST,
                command: '451',
                params: ['*'],
                trailing: 'You have not registered',
              }),
            ],
          },
        ];
      }
      const channels = (parsed.params[0] ?? '').split(',').map((c) => c.trim()).filter(Boolean);
      const events: ServerEvent[] = [];
      for (const ch of channels) {
        if (!ch.startsWith('#')) continue;
        events.push({ kind: 'join_request', channel: ch.toLowerCase() });
      }
      return events;
    }

    case 'PART': {
      if (!state.authenticated) return [];
      const channels = (parsed.params[0] ?? '').split(',').map((c) => c.trim()).filter(Boolean);
      const events: ServerEvent[] = [];
      for (const ch of channels) {
        if (!ch.startsWith('#')) continue;
        events.push({ kind: 'part_request', channel: ch.toLowerCase() });
        state.joinedChannels.delete(ch.toLowerCase());
      }
      return events;
    }

    case 'PRIVMSG': {
      if (!state.authenticated) {
        return [
          {
            kind: 'send',
            lines: [
              serializeIrcLine({
                prefix: SERVER_HOST,
                command: '451',
                params: ['*'],
                trailing: 'You have not registered',
              }),
            ],
          },
        ];
      }
      const channel = (parsed.params[0] ?? '').toLowerCase();
      const body = parsed.params[1] ?? '';
      if (!channel.startsWith('#') || !body) return [];
      if (!state.joinedChannels.has(channel)) {
        // Twitch returns 442 NOT IN CHANNEL.
        return [
          {
            kind: 'send',
            lines: [
              serializeIrcLine({
                prefix: SERVER_HOST,
                command: '442',
                params: [state.nick ?? '*', channel],
                trailing: "You're not on that channel",
              }),
            ],
          },
        ];
      }
      return [{ kind: 'privmsg', channel, body, tags: parsed.tags }];
    }

    case 'QUIT':
      return [{ kind: 'quit', reason: parsed.params[0] }];

    default:
      return [{ kind: 'unknown', command: parsed.command, params: parsed.params }];
  }
};

const tryAuth = (state: ConnectionState): ServerEvent[] => {
  if (state.authenticated) return [];
  if (!state.passReceived || !state.nick || !state.presentedBearer) return [];
  return [
    {
      kind: 'auth_attempt',
      presentedBearer: state.presentedBearer,
      nick: state.nick,
    },
  ];
};

// --------------------------- responses --------------------------------------

/**
 * Build the welcome burst the host ships to the bot once {@link onAuthVerified}
 * confirms a valid bearer. The lines mirror Twitch's reference welcome
 * burst (001 → 376) so existing libraries that wait on 376 to consider
 * the connection ready will work unchanged.
 */
export const buildWelcomeBurst = (nick: string): string[] => {
  const lines: SerializeOptions[] = [
    { prefix: SERVER_HOST, command: '001', params: [nick], trailing: 'Welcome, GLHF!' },
    { prefix: SERVER_HOST, command: '002', params: [nick], trailing: `Your host is ${SERVER_HOST}` },
    {
      prefix: SERVER_HOST,
      command: '003',
      params: [nick],
      trailing: 'This server is rather new',
    },
    { prefix: SERVER_HOST, command: '004', params: [nick], trailing: '-' },
    { prefix: SERVER_HOST, command: '375', params: [nick], trailing: '-' },
    {
      prefix: SERVER_HOST,
      command: '372',
      params: [nick],
      trailing: 'You are in a maze of twisty passages, all alike.',
    },
    { prefix: SERVER_HOST, command: '376', params: [nick], trailing: '>' },
  ];
  return lines.map(serializeIrcLine);
};

/**
 * Build the JOIN burst the host ships when {@link onJoinAccepted}. Twitch
 * sends a JOIN echo + 353 NAMES + 366 end-of-NAMES so libraries that
 * gate on 366 to consider the JOIN done work unchanged.
 */
export const buildJoinBurst = (nick: string, channel: string): string[] => {
  const userhost = `${nick}!${nick}@${nick}.${SERVER_HOST}`;
  return [
    serializeIrcLine({ prefix: userhost, command: 'JOIN', params: [channel] }),
    serializeIrcLine({
      prefix: `${nick}.${SERVER_HOST}`,
      command: '353',
      params: [nick, '=', channel],
      trailing: nick,
    }),
    serializeIrcLine({
      prefix: `${nick}.${SERVER_HOST}`,
      command: '366',
      params: [nick, channel],
      trailing: 'End of /NAMES list',
    }),
  ];
};

export const buildJoinDenied = (nick: string, channel: string): string[] => [
  serializeIrcLine({
    prefix: SERVER_HOST,
    command: '475',
    params: [nick, channel],
    trailing: 'Cannot join channel (+k)',
  }),
];

export const buildAuthFailedAndClose = (): string[] => [
  serializeIrcLine({
    prefix: SERVER_HOST,
    command: 'NOTICE',
    params: ['*'],
    trailing: 'Login authentication failed',
  }),
];

/**
 * Translate an inbound chat message (from any platform's chat bridge,
 * already normalised) into a PRIVMSG line we can ship to the bot. The
 * `tags` map carries IRCv3 metadata; pass through fields the bot might
 * care about — `display-name`, `color`, `id`, `room-id`, `tmi-sent-ts`.
 */
export interface OutgoingPrivmsg {
  channel: string;
  /** Chat-author login (lowercased). */
  authorLogin: string;
  body: string;
  tags?: Record<string, string>;
}

export const buildOutgoingPrivmsg = (msg: OutgoingPrivmsg): string => {
  const userhost = `${msg.authorLogin}!${msg.authorLogin}@${msg.authorLogin}.${SERVER_HOST}`;
  return serializeIrcLine({
    tags: msg.tags,
    prefix: userhost,
    command: 'PRIVMSG',
    params: [msg.channel],
    trailing: msg.body,
  });
};
