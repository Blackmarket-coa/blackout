import type { MarketplaceProviderId } from '@blackout/core';
import { db } from '../db/store';

const ROLE_GRANT_KIND = 'role_grant';
const ACTIVE_STATUSES = new Set(['granted', 'pending']);

export interface RoleGrant {
    entitlementId: string;
    userId: string;
    providerId: MarketplaceProviderId;
    /** Provider listing id corresponds to the role's storefront SKU. */
    listingId: string;
    /** Caller-set roleId carried in entitlement metadata, when present. */
    roleId: string | null;
    /** Caller-set communityId scope for the role, when present. */
    communityId: string | null;
    grantedAt: string;
    expiresAt: string | null;
}

function metaString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

// Lists every active role grant for a user. Roles are entitlements with
// kind='role_grant'; the role's identity comes from
// metadata.roleId (and optional metadata.communityId for scope).
export function listRolesForUser(userId: string): RoleGrant[] {
    const rows = db.listMarketplaceEntitlementsByUser(userId);
    const grants: RoleGrant[] = [];
    for (const row of rows) {
        if (row.kind !== ROLE_GRANT_KIND) continue;
        if (!ACTIVE_STATUSES.has(row.status)) continue;
        if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) continue;
        grants.push({
            entitlementId: row.id,
            userId: row.userId,
            providerId: row.providerId as MarketplaceProviderId,
            listingId: row.providerListingId,
            roleId: metaString(row.metadata['roleId']),
            communityId: metaString(row.metadata['communityId']),
            grantedAt: row.grantedAt,
            expiresAt: row.expiresAt,
        });
    }
    return grants;
}

// Single-role check. roleId is whatever the role storefront listing
// stamps into entitlement.metadata.roleId — the channel-permissions
// system will switch on it.
export function userHasRole(userId: string, roleId: string): boolean {
    return listRolesForUser(userId).some((g) => g.roleId === roleId);
}

// Same as userHasRole but scoped to a community — useful for
// community-specific role purchases (e.g. "Supporter" role only valid
// within community X).
export function userHasRoleInCommunity(
    userId: string,
    roleId: string,
    communityId: string
): boolean {
    return listRolesForUser(userId).some(
        (g) => g.roleId === roleId && g.communityId === communityId
    );
}
