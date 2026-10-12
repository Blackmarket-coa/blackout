import { createFetchApiClient } from '@blackout/sdk';
import { API_BASE_URL } from '../app/sdk/apiBaseUrl';

/**
 * Session lengths for a Black Mask chat panel sign-in (launch-plan step B3,
 * docs/black-mask-chat-panel-and-account-link.md section 3).
 *
 * The length is enforced by the servers, not by this client: the homeserver's
 * blackout_runtime module caps the panel device's tokens and signs the device
 * out at the end, and the Blackout API caps everything it issues for that
 * session at the same end. The panel only offers a timed length when both say
 * they enforce it, and it binds the length to the new device before it keeps
 * or uses the device's tokens.
 */

export const SESSION_LENGTHS = ['1h', '1d', '7d', '30d', 'until_sign_out'] as const;

export type SessionLength = typeof SESSION_LENGTHS[number];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** How long each length lasts; null means no added end. Mirrors the server. */
export const SESSION_LENGTH_MS: Readonly<Record<SessionLength, number | null>> = {
    '1h': HOUR_MS,
    '1d': DAY_MS,
    '7d': 7 * DAY_MS,
    '30d': 30 * DAY_MS,
    until_sign_out: null,
};

export const SESSION_LENGTH_LABELS: Readonly<Record<SessionLength, string>> = {
    '1h': '1 hour',
    '1d': '1 day',
    '7d': '7 days',
    '30d': '30 days',
    until_sign_out: 'Until I sign out',
};

export const isSessionLength = (value: unknown): value is SessionLength =>
    typeof value === 'string' && (SESSION_LENGTHS as readonly string[]).includes(value);

/** A length that needs the servers to end the session on time. */
export const isTimedSessionLength = (length: SessionLength): boolean =>
    SESSION_LENGTH_MS[length] !== null;

/**
 * What the panel signs in with. `enforcedByServer` is true only when both the
 * homeserver and the Blackout API said they enforce session lengths; a timed
 * length is never used without it.
 */
export type PanelSessionChoice = {
    length: SessionLength;
    enforcedByServer: boolean;
};

const HOMESERVER_LENGTHS_PATH = '/_synapse/client/blackout/session/lengths';
const HOMESERVER_LENGTH_PATH = '/_synapse/client/blackout/session/length';

/**
 * How long each request may take. None of them may hang sign-in: an
 * unanswered check means no timed lengths, an unanswered bind means no
 * sign-in, and an unanswered sign-out is left to the server's own end.
 */
export const SESSION_LENGTH_REQUEST_TIMEOUT_MS = 10_000;

/** An AbortSignal that fires after `ms`, with a way to stop the timer. */
const timeoutSignal = (ms: number): { signal: AbortSignal; done: () => void } => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, done: () => clearTimeout(timer) };
};

const parseLengths = (value: unknown): Set<SessionLength> => {
    const list =
        value && typeof value === 'object'
            ? (value as { session_lengths?: unknown; sessionLengths?: unknown })
            : {};
    const raw = Array.isArray(list.session_lengths)
        ? list.session_lengths
        : Array.isArray(list.sessionLengths)
        ? list.sessionLengths
        : [];
    return new Set(raw.filter(isSessionLength));
};

/**
 * The lengths this panel may offer as server-enforced: those listed by both
 * the homeserver and the Blackout API. Empty when either does not answer —
 * then only "Until I sign out", which needs no enforcement, may be offered.
 */
export const fetchEnforcedSessionLengths = async (
    homeserverBaseUrl: string
): Promise<Set<SessionLength>> => {
    const { signal, done } = timeoutSignal(SESSION_LENGTH_REQUEST_TIMEOUT_MS);
    try {
        const [homeserver, api] = await Promise.all([
            fetch(new URL(HOMESERVER_LENGTHS_PATH, homeserverBaseUrl), { signal }).then(
                async (res) => (res.ok ? parseLengths(await res.json()) : new Set<SessionLength>())
            ),
            createFetchApiClient({ baseUrl: API_BASE_URL })({
                method: 'GET',
                path: '/v1/auth/session-lengths',
                signal,
            }).then((body) =>
                (body as { enforced?: unknown })?.enforced === true
                    ? parseLengths(body)
                    : new Set<SessionLength>()
            ),
        ]);
        return new Set([...homeserver].filter((length) => api.has(length)));
    } catch {
        return new Set();
    } finally {
        done();
    }
};

export class SessionLengthBindError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SessionLengthBindError';
    }
}

/**
 * Record the chosen length against the device that owns `accessToken`. The
 * homeserver caps that device's tokens at the end in the same step and signs
 * the device out when it comes. Resolves only when the homeserver confirms
 * exactly the length asked for.
 */
export const bindSessionLength = async (
    homeserverBaseUrl: string,
    accessToken: string,
    length: SessionLength
): Promise<{ expiresAtMs: number | null }> => {
    const { signal, done } = timeoutSignal(SESSION_LENGTH_REQUEST_TIMEOUT_MS);
    let response: Response;
    let body: { session_length?: unknown; expires_at_ms?: unknown };
    try {
        try {
            response = await fetch(new URL(HOMESERVER_LENGTH_PATH, homeserverBaseUrl), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ session_length: length }),
                signal,
            });
        } catch {
            throw new SessionLengthBindError('The homeserver could not be reached in time.');
        }
        if (!response.ok) {
            throw new SessionLengthBindError(`The homeserver refused (${response.status}).`);
        }
        try {
            body = (await response.json()) as typeof body;
        } catch {
            throw new SessionLengthBindError('The homeserver sent an unreadable answer.');
        }
    } finally {
        done();
    }
    const timed = isTimedSessionLength(length);
    const expiresAtMs = body.expires_at_ms;
    const endOk = timed
        ? typeof expiresAtMs === 'number' && Number.isFinite(expiresAtMs)
        : expiresAtMs === null;
    if (body.session_length !== length || !endOk) {
        throw new SessionLengthBindError('The homeserver did not confirm the session length.');
    }
    return { expiresAtMs: timed ? (expiresAtMs as number) : null };
};

/**
 * Best-effort sign-out of a device by its access token alone (no running
 * client): a device whose length could not be bound, so a session the user was
 * never told about does not linger, or a stored panel session found already
 * past its end. The homeserver accepts logout with an expired token.
 */
export const signOutDeviceByToken = async (
    homeserverBaseUrl: string,
    accessToken: string
): Promise<void> => {
    const { signal, done } = timeoutSignal(SESSION_LENGTH_REQUEST_TIMEOUT_MS);
    try {
        await fetch(new URL('/_matrix/client/v3/logout', homeserverBaseUrl), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: '{}',
            signal,
        });
    } catch {
        // Nothing more to do: the tokens are discarded either way.
    } finally {
        done();
    }
};

/** The longest delay `setTimeout` honours (about 24.8 days). */
export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;
