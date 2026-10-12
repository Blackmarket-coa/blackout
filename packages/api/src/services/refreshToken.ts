import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { RefreshTokenRecord } from '../db/types';

const REFRESH_TOKEN_BYTES = 48;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

const ttlSeconds = (): number => {
    const fromEnv = Number.parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS ?? '', 10);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TTL_SECONDS;
};

export interface IssuedRefreshToken {
    token: string;
    record: RefreshTokenRecord;
}

export interface RotateOptions {
    userId: string;
    /** Existing family id when rotating; omit to start a new family at login. */
    familyId?: string;
    userAgent?: string;
    /**
     * ISO end of a session with a server-enforced length. The token expires no
     * later than this, and the family can never be refreshed past it.
     */
    sessionExpiresAt?: string;
}

const userAgentHash = (userAgent?: string): string | undefined =>
    userAgent ? sha256(userAgent) : undefined;

export const issueRefreshToken = (options: RotateOptions): IssuedRefreshToken => {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const id = randomUUID();
    const familyId = options.familyId ?? randomUUID();
    const ttlEndMs = Date.now() + ttlSeconds() * 1000;
    // `?? undefined`: a stored row reads a NULL column back as an absent field,
    // but never let a stray null be mistaken for an end at the epoch.
    const sessionExpiresAt = options.sessionExpiresAt ?? undefined;
    const expiresAt = new Date(
        sessionExpiresAt === undefined
            ? ttlEndMs
            : Math.min(ttlEndMs, new Date(sessionExpiresAt).getTime())
    ).toISOString();
    const record = db.createRefreshToken({
        id,
        userId: options.userId,
        familyId,
        tokenHash: sha256(token),
        expiresAt,
        userAgentHash: userAgentHash(options.userAgent),
        ...(sessionExpiresAt === undefined ? {} : { sessionExpiresAt }),
    });
    return { token, record };
};

/** True once a family with a server-enforced length has reached its end. */
export const sessionHasEnded = (record: Pick<RefreshTokenRecord, 'sessionExpiresAt'>): boolean => {
    const end = record.sessionExpiresAt ?? undefined;
    if (end === undefined) return false;
    const endMs = new Date(end).getTime();
    // An unreadable end is treated as ended: a malformed bound must never
    // turn into no bound.
    return !Number.isFinite(endMs) || endMs <= Date.now();
};

export type RefreshOutcome =
    | { kind: 'ok'; record: RefreshTokenRecord; rotated: IssuedRefreshToken }
    | { kind: 'invalid' }
    | { kind: 'expired' }
    | { kind: 'revoked' }
    | { kind: 'session_expired' }
    | { kind: 'reuse_detected'; userId: string; familyId: string };

export const rotateRefreshToken = (presentedToken: string, userAgent?: string): RefreshOutcome => {
    const tokenHash = sha256(presentedToken);
    const existing = db.findRefreshTokenByHash(tokenHash);
    if (!existing) return { kind: 'invalid' };

    // If this token was already replaced (rotated) and someone presents it again,
    // that's a reuse signal. Burn the entire family — both replicas of the
    // attacker's flow and the legitimate user's flow get logged out, but the
    // attacker is forced to reauthenticate before they can re-establish a
    // session.
    if (existing.replacedBy) {
        db.revokeRefreshTokenFamily(existing.familyId, 'reuse_detected');
        // Reuse means the refresh token leaked; also invalidate the user's already
        // minted access tokens so a stolen access token cannot outlive detection.
        db.revokeUserTokensBefore(existing.userId, 'reuse_detected');
        return { kind: 'reuse_detected', userId: existing.userId, familyId: existing.familyId };
    }
    if (existing.revokedAt) return { kind: 'revoked' };
    // A session with a server-enforced length ends for the whole family at
    // once: burn it, so nothing in it can be presented again.
    if (sessionHasEnded(existing)) {
        db.revokeRefreshTokenFamily(existing.familyId, 'session_expired');
        return { kind: 'session_expired' };
    }
    if (new Date(existing.expiresAt).getTime() <= Date.now()) return { kind: 'expired' };

    // Mint the successor first so its row exists before the old token's
    // replaced_by references it (preserves FK-safe write ordering under the
    // postgres write-behind queue), then atomically claim the old token.
    const rotated = issueRefreshToken({
        userId: existing.userId,
        familyId: existing.familyId,
        userAgent,
        sessionExpiresAt: existing.sessionExpiresAt,
    });
    // Compare-and-swap: stamp replacedBy ONLY if the token is still live. Two
    // concurrent rotations of the same token cannot both win this within a
    // process. The loser's freshly-minted successor is burned with the family
    // below, so no orphan live token survives. (L2)
    const claimed = db.consumeRefreshTokenForRotation(existing.id, rotated.record.id);
    if (!claimed || claimed.replacedBy !== rotated.record.id) {
        // Lost the race: another rotation already consumed this token. Treat as
        // reuse — burn the whole family (old token, our orphan successor, and
        // the winner's successor) and invalidate outstanding access tokens.
        db.revokeRefreshTokenFamily(existing.familyId, 'reuse_detected');
        db.revokeUserTokensBefore(existing.userId, 'reuse_detected');
        return { kind: 'reuse_detected', userId: existing.userId, familyId: existing.familyId };
    }
    return { kind: 'ok', record: existing, rotated };
};

export const revokeRefreshToken = (presentedToken: string, reason = 'logout'): boolean => {
    const tokenHash = sha256(presentedToken);
    const existing = db.findRefreshTokenByHash(tokenHash);
    if (!existing || existing.revokedAt) return false;
    db.revokeRefreshTokenFamily(existing.familyId, reason);
    return true;
};

export const revokeAllForUser = (userId: string, reason = 'admin_revoke'): number =>
    db.revokeRefreshTokensForUser(userId, reason);

export const __test__ = { sha256 };
