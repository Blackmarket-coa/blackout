import type { MarketplaceProviderId } from '@blackout/core';

/**
 * Matrix custom event type used to attach FreeBlackMarket (or any
 * other registered marketplace provider) listings onto messages,
 * canopy state, and stream descriptions. Events are namespaced under
 * `co.bmc.*` to match the existing coalition / forum / welcome
 * conventions and round-trip cleanly through federation.
 *
 * Schema is intentionally narrow: a small array of `(providerId,
 * listingId, sku?, label?)` tuples. The provider+listingId is the
 * canonical key; everything else is a presentation hint that the
 * renderer can fall back to when the live FBM lookup hasn't returned
 * yet.
 */
export const PRODUCT_ATTACHMENTS_EVENT_TYPE = 'co.bmc.product_attachments' as const;

export interface ProductAttachmentRef {
    providerId: MarketplaceProviderId;
    listingId: string;
    /** Optional SKU for variant-aware listings. */
    sku?: string;
    /** Optional snapshot label (used while the live listing is loading). */
    label?: string;
    /** Optional snapshot price-cents (used as a placeholder; live price wins). */
    priceCents?: number;
    /** Optional snapshot currency code. */
    currency?: string;
}

export interface ProductAttachmentsEventContent {
    /** Schema marker — must be `1` until breaking changes are introduced. */
    version: 1;
    listings: ProductAttachmentRef[];
}

/**
 * Defensive parser for arbitrary event content. Returns an empty
 * `listings` array when the payload is malformed so renderers can
 * always fall back to a no-op render rather than crashing on
 * untrusted federated content.
 */
export const parseProductAttachmentsEvent = (raw: unknown): ProductAttachmentsEventContent => {
    if (!raw || typeof raw !== 'object') return { version: 1, listings: [] };
    const value = raw as Record<string, unknown>;
    const version = value.version === 1 ? 1 : 1;
    const rawList = Array.isArray(value.listings) ? value.listings : [];

    const listings: ProductAttachmentRef[] = [];
    for (const entry of rawList) {
        if (!entry || typeof entry !== 'object') continue;
        const item = entry as Record<string, unknown>;
        const providerId = typeof item.providerId === 'string' ? item.providerId : null;
        const listingId = typeof item.listingId === 'string' ? item.listingId : null;
        if (!providerId || !listingId) continue;
        const ref: ProductAttachmentRef = {
            providerId: providerId as MarketplaceProviderId,
            listingId,
        };
        if (typeof item.sku === 'string') ref.sku = item.sku;
        if (typeof item.label === 'string') ref.label = item.label;
        if (typeof item.priceCents === 'number' && Number.isFinite(item.priceCents)) {
            ref.priceCents = Math.max(0, Math.floor(item.priceCents));
        }
        if (typeof item.currency === 'string') ref.currency = item.currency;
        listings.push(ref);
    }

    return { version, listings };
};

/**
 * Builder used by the attach dialog (and any future composer
 * affordance) to produce a well-formed event payload from a list of
 * refs. Trims to a maximum of 8 attachments per event so renderers
 * never need to virtualize a card list.
 */
export const buildProductAttachmentsEvent = (
    refs: ProductAttachmentRef[]
): ProductAttachmentsEventContent => ({
    version: 1,
    listings: refs.slice(0, 8),
});
