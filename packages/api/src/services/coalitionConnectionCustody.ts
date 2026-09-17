/**
 * Ending custody of a stored platform credential.
 *
 * Its own module because both sides of the coalition feature need it and
 * neither can own it: `coalitionSync` revokes links when a coalition
 * disconnects a platform, `coalitionNetworkStore` revokes them when a member
 * leaves, and `coalitionSync` already imports the store. Putting the function
 * in either one would close an import cycle between them.
 *
 * The secret is deleted, not orphaned. A revoked row that still holds
 * ciphertext is a credential at rest that no screen admits exists and nobody
 * is watching — which is the state every member link was in before this, since
 * nothing in the codebase ever wrote `revokedAt` at all.
 */
import type { CoalitionPlatform } from '@blackout/core';
import { db } from '../db/store';

/**
 * Revoke stored personal links, optionally narrowed to one platform or member.
 *
 * Returns how many rows it revoked.
 */
export function revokeMemberLinks(
    coalitionId: string,
    filter: { platform?: CoalitionPlatform; userId?: string } = {},
    now = new Date().toISOString()
): number {
    const rows = db
        .listCoalitionMemberConnections({
            coalitionId,
            ...(filter.userId ? { userId: filter.userId } : {}),
        })
        .filter((row) => !row.revokedAt && (!filter.platform || row.platform === filter.platform));
    for (const row of rows) {
        const { credentialRef: _dropped, ...withoutCredential } = row;
        db.upsertCoalitionMemberConnection({ ...withoutCredential, revokedAt: now });
    }
    return rows.length;
}
