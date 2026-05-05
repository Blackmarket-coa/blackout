import type { MarketplaceProviderId } from '@blackout/core';
import { db } from '../db/store';

const CHANNEL_ACCESS_KIND = 'channel_access';
const ACTIVE_STATUSES = new Set(['granted', 'pending']);

export interface ChannelAccessGrant {
    entitlementId: string;
    userId: string;
    providerId: MarketplaceProviderId;
    listingId: string;
    channelId: string | null;
    grantedAt: string;
    expiresAt: string | null;
}

function metaString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

// Returns true iff the user has paid for access to this channel and the
// entitlement is currently in an access-granting state. Channel id is
// matched off entitlement.metadata.channelId — paid voice rooms (X
// Spaces analog) and gated text channels both use this kind.
export function userHasChannelAccess(userId: string, channelId: string): boolean {
    const rows = db.listMarketplaceEntitlementsByUser(userId);
    for (const row of rows) {
        if (row.kind !== CHANNEL_ACCESS_KIND) continue;
        if (!ACTIVE_STATUSES.has(row.status)) continue;
        if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) continue;
        if (metaString(row.metadata['channelId']) === channelId) return true;
    }
    return false;
}

export function listChannelAccessForUser(userId: string): ChannelAccessGrant[] {
    const rows = db.listMarketplaceEntitlementsByUser(userId);
    const grants: ChannelAccessGrant[] = [];
    for (const row of rows) {
        if (row.kind !== CHANNEL_ACCESS_KIND) continue;
        if (!ACTIVE_STATUSES.has(row.status)) continue;
        grants.push({
            entitlementId: row.id,
            userId: row.userId,
            providerId: row.providerId as MarketplaceProviderId,
            listingId: row.providerListingId,
            channelId: metaString(row.metadata['channelId']),
            grantedAt: row.grantedAt,
            expiresAt: row.expiresAt,
        });
    }
    return grants;
}
