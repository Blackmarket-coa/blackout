// FBM-id <-> Matrix-id resolution and privacy-by-default pseudonymization for the
// FBM -> Matrix bridge.
//
// AOG section 8.3: buyer aliases in vendor-facing rooms are pseudonymous; a
// buyer's real MXID is never written into a vendor room's message content or
// state. The raw MXID is used only for membership operations (invite/kick) and
// the buyer's own order room. `pseudonymousAlias` is a stable, non-reversible
// HMAC of the buyer MXID scoped to a vendor, so the same buyer reads
// consistently within one vendor's rooms but cannot be correlated across vendors
// or back to their MXID.

import { createHmac } from 'node:crypto';
import { db } from '../../db/store';

const homeserverDomain = (): string =>
    (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');

const looksLikeMxid = (value: string): boolean => /^@[^:]+:[^:]+$/.test(value);

/**
 * Resolve an FBM `userId` (the Blackout user `sub`) to a Matrix MXID. Prefers the
 * stored username (mirrors scheduledMessageDispatcher's `getUserById` lookup);
 * accepts a value that is already an MXID; otherwise returns `null` so callers
 * skip membership operations rather than inventing an address.
 */
export function resolveBuyerMxid(userId: string): string | null {
    if (looksLikeMxid(userId)) return userId;
    const user = db.getUserById(userId);
    if (user?.username) return `@${user.username}:${homeserverDomain()}`;
    return null;
}

/**
 * Resolve a vendor to a Matrix MXID for membership operations. The FBM event may
 * carry the vendor's MXID explicitly (preferred); otherwise we accept a value
 * that is already an MXID or look it up as a Blackout user. Returns `null` when
 * the vendor cannot be addressed (rooms are still created; the invite is simply
 * skipped).
 */
export function resolveVendorMxid(vendorId: string, explicit?: string): string | null {
    if (explicit && looksLikeMxid(explicit)) return explicit;
    if (looksLikeMxid(vendorId)) return vendorId;
    const user = db.getUserById(vendorId);
    if (user?.username) return `@${user.username}:${homeserverDomain()}`;
    return null;
}

const pseudonymSalt = (): string =>
    process.env.FBM_PSEUDONYM_SALT ?? 'blackout-fbm-dev-pseudonym-salt';

/**
 * Stable, non-reversible alias for a buyer within a single vendor's rooms, e.g.
 * `buyer~e3f9a1`. Derived from the buyer MXID + vendor id under a server salt so
 * the alias is consistent for that buyer/vendor pair but reveals nothing about
 * the underlying MXID and does not correlate across vendors.
 */
export function pseudonymousAlias(buyerMxid: string, vendorId: string): string {
    const digest = createHmac('sha256', pseudonymSalt())
        .update(`${vendorId}:${buyerMxid}`)
        .digest('hex');
    return `buyer~${digest.slice(0, 6)}`;
}

/**
 * Alias derived from an FBM `userId` even when the buyer has no resolvable MXID,
 * so vendor-room messages always carry a stable pseudonym. Falls back to hashing
 * the raw `userId` when no MXID is available.
 */
export function buyerAliasForUserId(userId: string, vendorId: string): string {
    const mxid = resolveBuyerMxid(userId);
    return pseudonymousAlias(mxid ?? userId, vendorId);
}
