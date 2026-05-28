import crypto from 'node:crypto';
import type {
    CreatorListing,
    CreatorListingDraft,
    CreatorListingStatus,
    MarketplaceProviderId,
} from '@blackout/core';
import { db } from '../db/store';
import type { CreatorListingRecord } from '../db/types';
import { logEvent } from './marketplaceObservability';

export interface CreateCreatorListingInput {
    sellerUserId: string;
    providerId: MarketplaceProviderId;
    draft: CreatorListingDraft;
    providerListingId: string | null;
    publicSlug: string | null;
    status: CreatorListingStatus;
}

function toCreatorListing(record: CreatorListingRecord): CreatorListing {
    return {
        id: record.id,
        providerId: record.providerId as MarketplaceProviderId,
        providerListingId: record.providerListingId,
        sellerUserId: record.sellerUserId,
        artifactKind: record.artifactKind as CreatorListing['artifactKind'],
        category: record.category as CreatorListing['category'],
        entitlementKind: record.entitlementKind as CreatorListing['entitlementKind'],
        title: record.title,
        description: record.description,
        priceCents: record.priceCents,
        currency: record.currency,
        status: record.status as CreatorListingStatus,
        ...(record.feeBpsOverride !== undefined ? { feeBpsOverride: record.feeBpsOverride } : {}),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        publishedAt: record.publishedAt,
        publicSlug: record.publicSlug,
    };
}

export function createCreatorListingRecord(input: CreateCreatorListingInput): CreatorListing {
    const id = crypto.randomUUID();
    const record = db.createCreatorListing({
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
        ...(input.draft.feeBpsOverride !== undefined
            ? { feeBpsOverride: input.draft.feeBpsOverride }
            : {}),
        publishedAt: input.status === 'published' ? new Date().toISOString() : null,
        publicSlug: input.publicSlug,
    });
    logEvent('creator.listing.created', {
        id,
        sellerUserId: input.sellerUserId,
        providerId: input.providerId,
        artifactKind: input.draft.artifactKind,
        status: input.status,
    });
    return toCreatorListing(record);
}

export function getCreatorListing(id: string): CreatorListing | undefined {
    const record = db.getCreatorListing(id);
    return record ? toCreatorListing(record) : undefined;
}

export function listCreatorListingsForUser(sellerUserId: string): CreatorListing[] {
    return db.listCreatorListingsForSeller(sellerUserId).map(toCreatorListing);
}

export function updateCreatorListingStatus(
    id: string,
    update: {
        status?: CreatorListingStatus;
        providerListingId?: string | null;
        publicSlug?: string | null;
    }
): CreatorListing | undefined {
    const existing = db.getCreatorListing(id);
    if (!existing) return undefined;
    const patch: Partial<
        Pick<CreatorListingRecord, 'status' | 'providerListingId' | 'publicSlug' | 'publishedAt'>
    > = {};
    if (update.status !== undefined) patch.status = update.status;
    if (update.providerListingId !== undefined) patch.providerListingId = update.providerListingId;
    if (update.publicSlug !== undefined) patch.publicSlug = update.publicSlug;
    if (update.status === 'published' && !existing.publishedAt) {
        patch.publishedAt = new Date().toISOString();
    }
    const updated = db.updateCreatorListing(id, patch);
    return updated ? toCreatorListing(updated) : undefined;
}

export function deleteCreatorListing(id: string): boolean {
    return db.deleteCreatorListing(id);
}

export function _resetCreatorListingsForTest(): void {
    db.creatorListings.clear();
}
