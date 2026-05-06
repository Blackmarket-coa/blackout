import { describe, expect, it } from 'vitest';
import {
    PRODUCT_ATTACHMENTS_EVENT_TYPE,
    buildProductAttachmentsEvent,
    parseProductAttachmentsEvent,
    type ProductAttachmentRef,
} from './productAttachmentSchema';

describe('parseProductAttachmentsEvent', () => {
    it('returns an empty payload for non-object input', () => {
        expect(parseProductAttachmentsEvent(null)).toEqual({ version: 1, listings: [] });
        expect(parseProductAttachmentsEvent('nope')).toEqual({ version: 1, listings: [] });
        expect(parseProductAttachmentsEvent(123)).toEqual({ version: 1, listings: [] });
    });

    it('drops malformed entries and keeps the well-formed ones', () => {
        const parsed = parseProductAttachmentsEvent({
            version: 1,
            listings: [
                { providerId: 'freeblackmarket', listingId: 'abc', label: 'Aid bundle' },
                { providerId: 42, listingId: 'no' },
                { providerId: 'freeblackmarket' }, // missing listingId
                { listingId: 'orphan' }, // missing providerId
                {
                    providerId: 'freeblackmarket',
                    listingId: 'def',
                    priceCents: 1500,
                    currency: 'USD',
                },
            ],
        });
        expect(parsed.listings).toEqual([
            { providerId: 'freeblackmarket', listingId: 'abc', label: 'Aid bundle' },
            { providerId: 'freeblackmarket', listingId: 'def', priceCents: 1500, currency: 'USD' },
        ]);
    });

    it('coerces priceCents to a non-negative integer', () => {
        const parsed = parseProductAttachmentsEvent({
            listings: [
                { providerId: 'freeblackmarket', listingId: 'a', priceCents: -10 },
                { providerId: 'freeblackmarket', listingId: 'b', priceCents: 99.7 },
                { providerId: 'freeblackmarket', listingId: 'c', priceCents: Infinity },
            ],
        });
        expect(parsed.listings[0].priceCents).toBe(0);
        expect(parsed.listings[1].priceCents).toBe(99);
        expect(parsed.listings[2].priceCents).toBeUndefined();
    });
});

describe('buildProductAttachmentsEvent', () => {
    it('caps the listings array at 8 entries', () => {
        const refs: ProductAttachmentRef[] = Array.from({ length: 12 }, (_, i) => ({
            providerId: 'freeblackmarket',
            listingId: `id-${i}`,
        }));
        const event = buildProductAttachmentsEvent(refs);
        expect(event.version).toBe(1);
        expect(event.listings).toHaveLength(8);
        expect(event.listings[0]?.listingId).toBe('id-0');
    });

    it('uses the canonical event type constant', () => {
        expect(PRODUCT_ATTACHMENTS_EVENT_TYPE).toBe('co.bmc.product_attachments');
    });
});
