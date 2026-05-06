import { findGift, GIFT_CATALOG, type GiftDefinition } from '@blackout/core';
import { createTip, captureTip, TipValidationError, type TipView } from './tips';
import type { TipContextKind } from '../db/types';

export class GiftError extends Error {
    constructor(
        public readonly code: 'unknown_sku' | 'self_gift_forbidden' | 'invalid_context',
        message: string
    ) {
        super(message);
        this.name = 'GiftError';
    }
}

export interface SendGiftInput {
    senderUserId: string;
    recipientUserId: string;
    sku: string;
    contextKind: TipContextKind;
    contextRef?: string | null;
    note?: string | null;
}

export interface GiftView {
    tip: TipView;
    gift: GiftDefinition;
}

export function listGiftCatalog(): readonly GiftDefinition[] {
    return GIFT_CATALOG;
}

export function getGift(sku: string): GiftDefinition | undefined {
    return findGift(sku);
}

// Sends a gift = creates a tip with the gift's price + sku. Single-shot
// path (no prepaid balance) so we never hold customer funds. The
// resulting tip rides the standard FBM checkout pipeline; capture is
// driven by the marketplace webhook dispatcher (metadata.tipId).
export function sendGift(input: SendGiftInput): GiftView {
    const gift = findGift(input.sku);
    if (!gift) {
        throw new GiftError('unknown_sku', `Unknown gift sku: ${input.sku}`);
    }
    if (input.contextKind === 'aid_pool') {
        throw new GiftError(
            'invalid_context',
            'Gifts target a creator; route aid contributions through tips directly.'
        );
    }
    try {
        const tip = createTip({
            senderUserId: input.senderUserId,
            recipientUserId: input.recipientUserId,
            contextKind: input.contextKind,
            contextRef: input.contextRef,
            grossCents: gift.priceCents,
            currency: gift.currency,
            note: input.note,
            giftSku: gift.sku,
        });
        return { tip, gift };
    } catch (error) {
        if (error instanceof TipValidationError && error.code === 'self_tip_forbidden') {
            throw new GiftError('self_gift_forbidden', 'You cannot gift yourself');
        }
        throw error;
    }
}

// Convenience for tests / future "instant" UI flows that immediately
// confirm a gift is captured (e.g. an in-process simulated checkout).
// In production the FBM webhook drives capture.
export function sendAndCaptureGiftForTest(input: SendGiftInput): GiftView {
    const view = sendGift(input);
    const captured = captureTip(view.tip.id, { fbmOrderId: `test-${view.tip.id}` });
    return { tip: captured ?? view.tip, gift: view.gift };
}
