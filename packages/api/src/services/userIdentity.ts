/**
 * The bridge between Blackout's two id spaces.
 *
 * Session JWTs identify the caller by Blackout user id (`sub`, a UUID), and the
 * Circle graph, relay edges and every other server-side table are keyed that
 * way. The profile surface is keyed by **Matrix id** (`@localpart:domain`) —
 * clients there only ever know `mx.getUserId()`.
 *
 * Mixing them silently yields empty results rather than errors, which is how
 * `/circle-map` and `/palettes` shipped permanently blank: they took an MXID
 * path param and handed it straight to UUID-keyed graph lookups. Both spaces
 * are plain strings, so nothing type-checks the mistake — hence one shared
 * conversion instead of a regex per call site.
 *
 * Only a Matrix id on THIS homeserver names a Blackout account. Until
 * 2026-10-25 the bridge took the localpart of any MXID and ignored its server
 * name, so `@alice:elsewhere.example` resolved to the local `alice`: a path or
 * body parameter naming a foreign account acted on the local one of the same
 * name (docs/security/api-findings-triage-2026-10-25.md, finding 2).
 */
import { db } from '../db/store';

/**
 * This deployment's homeserver server name. `MATRIX_HOMESERVER_DOMAIN` is a
 * deploy-time env var that must equal Synapse's `server_name` (the baseline
 * compose sets it from `PRIMARY_DOMAIN`); when it is unset the fallback keeps
 * ids well-formed rather than emitting `@user:undefined`.
 */
export const homeserverDomain = (): string =>
    (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');

// `@localpart:server_name`; the server name may carry a port.
const MXID_RE = /^@([^:\s]+):(\S+)$/;

/** The two parts of a Matrix id, or null when the value is not shaped like one. */
export const parseMatrixId = (value: string): { localpart: string; serverName: string } | null => {
    const match = MXID_RE.exec(value);
    return match ? { localpart: match[1], serverName: match[2] } : null;
};

/** Whether a Matrix id names an account on this homeserver (exact server-name match). */
export const isLocalMatrixId = (value: string): boolean =>
    parseMatrixId(value)?.serverName === homeserverDomain();

/**
 * The localpart of a Matrix id on this homeserver, or null for anything else,
 * an MXID on another server included. Only this homeserver mints
 * `@<username>:<its server name>`; the same localpart on another server is
 * another server's account, whatever it is called.
 */
export const matrixLocalpart = (value: string): string | null => {
    const parsed = parseMatrixId(value);
    if (!parsed || parsed.serverName !== homeserverDomain()) return null;
    return parsed.localpart;
};

/**
 * Accept either id space and return the Blackout user id, or null when the
 * user is unknown — which an MXID on another homeserver always is.
 * Resolution is by localpart = username.
 */
export function resolveBlackoutUserId(id: string): string | null {
    if (db.getUserById(id)) return id;
    const localpart = matrixLocalpart(id);
    if (!localpart) return null;
    return db.findUserByUsername(localpart)?.id ?? null;
}

/**
 * The Matrix id for a Blackout user id, for handing graph results back to a
 * profile-surface client. Returns null when the user is unknown.
 */
export function matrixUserIdFor(blackoutUserId: string): string | null {
    const user = db.getUserById(blackoutUserId);
    if (!user) return null;
    return `@${user.username}:${homeserverDomain()}`;
}
