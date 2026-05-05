import crypto from 'node:crypto';
import type {
    CreatorListing,
    CreatorListingDraft,
    CreatorListingStatus,
    MarketplaceProviderId,
} from '@blackout/core';
import { logEvent } from './marketplaceObservability';

const listings = new Map<string, CreatorListing>();
const byUser = new Map<string, Set<string>>();

function nowIso(): string {
    return new Date().toISOString();
}

export interface CreateCreatorListingInput {
    sellerUserId: string;
    providerId: MarketplaceProviderId;
    draft: CreatorListingDraft;
    providerListingId: string | null;
    publicSlug: string | null;
    status: CreatorListingStatus;
}

export function createCreatorListingRecord(input: CreateCreatorListingInput): CreatorListing {
    const id = crypto.randomUUID();
    const now = nowIso();
    const record: CreatorListing = {
        id,
        providerId: input.providerId,
        providerListingId: input.providerListingId,
        sellerUserId: input.sellerUserId,
        artifactKind: input.draft.artifactKind,
        category: input.draft.category,
        entitlementKind: input.draft.entitlementKind,
        title: input.draft.title,
        description: input.draft.description,
        priceCents: input.draft.priceCents,
        currency: input.draft.currency,
        status: input.status,
        createdAt: now,
        updatedAt: now,
        publishedAt: input.status === 'published' ? now : null,
        publicSlug: input.publicSlug,
    };
    listings.set(id, record);
    let userSet = byUser.get(input.sellerUserId);
    if (!userSet) {
        userSet = new Set();
        byUser.set(input.sellerUserId, userSet);
    }
    userSet.add(id);
    logEvent('creator.listing.created', {
        id,
        sellerUserId: input.sellerUserId,
        providerId: input.providerId,
        artifactKind: input.draft.artifactKind,
        status: input.status,
    });
    return record;
}

export function getCreatorListing(id: string): CreatorListing | undefined {
    return listings.get(id);
}

export function listCreatorListingsForUser(sellerUserId: string): CreatorListing[] {
    const ids = byUser.get(sellerUserId);
    if (!ids) return [];
    return [...ids]
        .map((id) => listings.get(id))
        .filter((record): record is CreatorListing => Boolean(record));
}

export function updateCreatorListingStatus(
    id: string,
    update: {
        status?: CreatorListingStatus;
        providerListingId?: string | null;
        publicSlug?: string | null;
    }
): CreatorListing | undefined {
    const existing = listings.get(id);
    if (!existing) return undefined;
    const next: CreatorListing = {
        ...existing,
        status: update.status ?? existing.status,
        providerListingId:
            update.providerListingId !== undefined
                ? update.providerListingId
                : existing.providerListingId,
        publicSlug: update.publicSlug !== undefined ? update.publicSlug : existing.publicSlug,
        updatedAt: nowIso(),
        publishedAt:
            update.status === 'published' && !existing.publishedAt
                ? nowIso()
                : existing.publishedAt,
    };
    listings.set(id, next);
    return next;
}

export function deleteCreatorListing(id: string): boolean {
    const existing = listings.get(id);
    if (!existing) return false;
    listings.delete(id);
    byUser.get(existing.sellerUserId)?.delete(id);
    return true;
}

export function _resetCreatorListingsForTest(): void {
    listings.clear();
    byUser.clear();
}
