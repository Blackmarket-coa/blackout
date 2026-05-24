import type { EntitlementKind, MarketplaceProviderId } from '@blackout/core';
import { db } from '../db/store';
import type { MarketplaceEntitlementRecord, MarketplaceProviderIdString } from '../db/types';
import { betaUnlockAllEnabled } from './betaUnlock';

// Status values that count as "the user currently has this" — granted is
// the happy path, pending is the in-flight grant for slow webhooks. Any
// terminal-bad status (refunded, chargebacked, revoked, expired) excludes
// the entitlement from access checks.
const ACTIVE_STATUSES = new Set(['granted', 'pending']);

export interface EntitlementGate {
    /** True if the entitlement is currently in an access-granting state. */
    canAccess: boolean;
    /** Underlying entitlement kind, for clients that switch on it. */
    kind: EntitlementKind | null;
    /** Source entitlement id, if one matched. */
    entitlementId: string | null;
    /** Captured for logging / debug. */
    status: MarketplaceEntitlementRecord['status'] | null;
}

// Single helper used by both the paywall route and the event-ticket gate.
// Walks the user's entitlement records for an exact (provider, listing)
// pair and returns the strongest active match. SKU is taken into account
// only when the caller passes one — listings without sku variants always
// match `null`.
export function entitlementForListing(
    userId: string,
    providerId: MarketplaceProviderId,
    providerListingId: string,
    sku: string | null = null
): EntitlementGate {
    // Beta override: every paywalled listing is accessible to every user.
    if (betaUnlockAllEnabled()) {
        return { canAccess: true, kind: null, entitlementId: null, status: 'granted' };
    }
    const matches = [...db.marketplaceEntitlements.values()].filter(
        (row) =>
            row.userId === userId &&
            row.providerId === (providerId as MarketplaceProviderIdString) &&
            row.providerListingId === providerListingId &&
            (sku === null || row.sku === sku)
    );
    if (matches.length === 0) {
        return { canAccess: false, kind: null, entitlementId: null, status: null };
    }
    const granted = matches.find((m) => m.status === 'granted');
    const pending = matches.find((m) => m.status === 'pending');
    const chosen = granted ?? pending ?? matches[0]!;
    const canAccess = ACTIVE_STATUSES.has(chosen.status);
    return {
        canAccess,
        kind: chosen.kind as EntitlementKind,
        entitlementId: chosen.id,
        status: chosen.status,
    };
}

// Convenience for paywalled posts: gate one listing for one viewer with a
// single boolean. Calling code should also fall through to the post being
// publicly visible when the listing/entitlement is missing — this only
// answers "did they pay?".
export function userOwnsListing(
    userId: string,
    providerId: MarketplaceProviderId,
    providerListingId: string,
    sku: string | null = null
): boolean {
    return entitlementForListing(userId, providerId, providerListingId, sku).canAccess;
}
