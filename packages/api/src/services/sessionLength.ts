/**
 * Server-enforced session lengths for the Black Mask chat panel (launch-plan
 * step B3, docs/black-mask-chat-panel-and-account-link.md section 3).
 *
 * The length itself is chosen and recorded on the homeserver (the
 * blackout_runtime module's `/_synapse/client/blackout/session/length`). This
 * API never takes a length from the client: when it exchanges a Matrix session
 * for a Blackout session it asks the homeserver when that Matrix session ends,
 * and bounds what it issues by that answer — the access JWT's `exp` (plus an
 * `sxp` claim checked on every verification) and the refresh-token family's
 * `sessionExpiresAt` (checked on every refresh).
 *
 * Asking the homeserver is gated by BLACKOUT_SESSION_LENGTHS (off by default),
 * so with the flag off the exchange makes exactly the requests it always made.
 * A bound that is already stored on a refresh family or in a JWT is enforced
 * whatever the flag says: turning the flag off must never lengthen a session.
 */

/** The lengths the panel offers, shortest first. Must match blackout_runtime. */
export const SESSION_LENGTHS = ['1h', '1d', '7d', '30d', 'until_sign_out'] as const;

export type SessionLength = typeof SESSION_LENGTHS[number];

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/** True when the exchange must bound API sessions by the homeserver's session end. */
export const sessionLengthsEnforced = (): boolean =>
    TRUTHY.has((process.env.BLACKOUT_SESSION_LENGTHS ?? '').trim().toLowerCase());

/** Epoch seconds for an epoch-millisecond session end, rounded down (never later). */
export const sessionEndSeconds = (expiresAtMs: number): number => Math.floor(expiresAtMs / 1000);
