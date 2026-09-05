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
 */
import { db } from '../db/store';

const MXID_LOCALPART_RE = /^@([^:\s]+):[^:\s]+$/;

export const matrixLocalpart = (value: string): string | null =>
    MXID_LOCALPART_RE.exec(value)?.[1] ?? null;

/**
 * Accept either id space and return the Blackout user id, or null when the
 * user is unknown. Resolution is by localpart = username, the same bridge
 * `subjectOwnsProfile` uses on the profile module.
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
 *
 * The homeserver domain is a deploy-time env var that must equal Synapse's
 * `server_name`; when it is unset the fallback keeps ids well-formed rather
 * than emitting `@user:undefined`.
 */
export function matrixUserIdFor(blackoutUserId: string): string | null {
    const user = db.getUserById(blackoutUserId);
    if (!user) return null;
    const domain = (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');
    return `@${user.username}:${domain}`;
}
