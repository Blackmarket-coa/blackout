import crypto from 'node:crypto';
import { computePlatformCommission, type MarketplaceProviderId } from '@blackout/core';
import { db } from '../db/store';
import type { TipContextKind, TipRecord, TipStatus } from '../db/types';
import type { MarketplaceProviderIdString } from '../db/types';
import { emitDomainEvent } from '../modules/domain-events';
import { incrementCounter, logEvent } from './marketplaceObservability';

const DEFAULT_PROVIDER: MarketplaceProviderId = 'freeblackmarket';
const MIN_TIP_CENTS = 100; // $1.00 floor — keeps the 3% fee >= 1¢ and deters dust spam.
const MAX_TIP_CENTS = 1_000_000; // $10,000 ceiling per single tip.
const MAX_NOTE_LEN = 280;

export class TipValidationError extends Error {
    constructor(
        public readonly code:
            | 'self_tip_forbidden'
            | 'recipient_unknown'
            | 'amount_below_floor'
            | 'amount_above_ceiling'
            | 'invalid_currency'
            | 'note_too_long'
            | 'duplicate_order',
        message: string
    ) {
        super(message);
        this.name = 'TipValidationError';
    }
}

export interface CreateTipInput {
    senderUserId: string;
    recipientUserId: string;
    contextKind: TipContextKind;
    contextRef?: string | null;
    grossCents: number;
    currency: string;
    note?: string | null;
    giftSku?: string | null;
    providerId?: MarketplaceProviderId;
    fbmOrderId?: string | null;
}

export interface TipView {
    id: string;
    senderUserId: string;
    recipientUserId: string;
    contextKind: TipContextKind;
    contextRef: string | null;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    providerId: MarketplaceProviderId;
    fbmOrderId: string | null;
    status: TipStatus;
    note: string | null;
    giftSku: string | null;
    createdAt: string;
    capturedAt: string | null;
    refundedAt: string | null;
}

function nowIso(): string {
    return new Date().toISOString();
}

function toView(record: TipRecord): TipView {
    return {
        id: record.id,
        senderUserId: record.senderUserId,
        recipientUserId: record.recipientUserId,
        contextKind: record.contextKind,
        contextRef: record.contextRef,
        grossCents: record.grossCents,
        feeCents: record.feeCents,
        netCents: record.netCents,
        currency: record.currency,
        providerId: record.providerId as MarketplaceProviderId,
        fbmOrderId: record.fbmOrderId,
        status: record.status,
        note: record.note,
        giftSku: record.giftSku,
        createdAt: record.createdAt,
        capturedAt: record.capturedAt,
        refundedAt: record.refundedAt,
    };
}

// Records the tip obligation in `pending` state and computes the 3% split
// for FBM. Money movement is delegated: the caller (route or scheduled
// reconciler) drives FBM checkout and later calls captureTip() with the
// resulting fbmOrderId. Self-tipping is rejected at this boundary; FBM
// fraud signals are layered on top by the provider.
export function createTip(input: CreateTipInput): TipView {
    if (input.senderUserId === input.recipientUserId) {
        throw new TipValidationError('self_tip_forbidden', 'You cannot tip yourself');
    }
    if (!db.getUserById(input.recipientUserId)) {
        throw new TipValidationError('recipient_unknown', 'Recipient user does not exist');
    }
    if (!Number.isInteger(input.grossCents) || input.grossCents < MIN_TIP_CENTS) {
        throw new TipValidationError(
            'amount_below_floor',
            `Tip must be at least ${MIN_TIP_CENTS} cents`
        );
    }
    if (input.grossCents > MAX_TIP_CENTS) {
        throw new TipValidationError(
            'amount_above_ceiling',
            `Tip exceeds the per-transaction ceiling of ${MAX_TIP_CENTS} cents`
        );
    }
    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3,8}$/.test(currency)) {
        throw new TipValidationError('invalid_currency', 'currency must be a 3–8 letter code');
    }
    if (input.note && input.note.length > MAX_NOTE_LEN) {
        throw new TipValidationError(
            'note_too_long',
            `note must be at most ${MAX_NOTE_LEN} characters`
        );
    }

    const providerId = (input.providerId ?? DEFAULT_PROVIDER) as MarketplaceProviderIdString;
    const split = computePlatformCommission(input.grossCents, providerId as MarketplaceProviderId);

    if (input.fbmOrderId) {
        const conflict = db.findTipByOrderId(providerId, input.fbmOrderId);
        if (conflict) {
            throw new TipValidationError(
                'duplicate_order',
                'A tip with this provider order id already exists'
            );
        }
    }

    const record: TipRecord = {
        id: crypto.randomUUID(),
        senderUserId: input.senderUserId,
        recipientUserId: input.recipientUserId,
        contextKind: input.contextKind,
        contextRef: input.contextRef ?? null,
        grossCents: split.grossCents,
        feeCents: split.feeCents,
        netCents: split.netCents,
        currency,
        providerId,
        fbmOrderId: input.fbmOrderId ?? null,
        status: 'pending',
        note: input.note ?? null,
        giftSku: input.giftSku ?? null,
        createdAt: nowIso(),
        capturedAt: null,
        refundedAt: null,
    };
    db.insertTip(record);

    incrementCounter('tip_created_total', { providerId, contextKind: record.contextKind });
    logEvent('tip.created', {
        tipId: record.id,
        senderUserId: record.senderUserId,
        recipientUserId: record.recipientUserId,
        grossCents: record.grossCents,
        feeCents: record.feeCents,
        currency: record.currency,
    });
    return toView(record);
}

// Marks a pending tip as captured once FBM confirms payment. Idempotent:
// repeated calls for the same already-captured tip return the existing view
// without re-emitting the domain event. Refunded tips cannot be captured.
export function captureTip(
    tipId: string,
    detail: { fbmOrderId?: string | null } = {}
): TipView | undefined {
    const existing = db.getTip(tipId);
    if (!existing) return undefined;
    if (existing.status === 'captured') return toView(existing);
    if (existing.status === 'refunded' || existing.status === 'failed') {
        logEvent('tip.capture.rejected', { tipId, status: existing.status });
        return toView(existing);
    }
    const updated: TipRecord = {
        ...existing,
        status: 'captured',
        capturedAt: nowIso(),
        fbmOrderId: detail.fbmOrderId ?? existing.fbmOrderId,
    };
    db.updateTip(updated);
    incrementCounter('tip_captured_total', {
        providerId: updated.providerId,
        contextKind: updated.contextKind,
    });
    emitDomainEvent({
        module: 'monetization',
        type: 'tip.captured',
        payload: {
            tipId: updated.id,
            senderUserId: updated.senderUserId,
            recipientUserId: updated.recipientUserId,
            contextKind: updated.contextKind,
            contextRef: updated.contextRef,
            grossCents: updated.grossCents,
            feeCents: updated.feeCents,
            netCents: updated.netCents,
            currency: updated.currency,
            providerId: updated.providerId,
        },
    });
    logEvent('tip.captured', {
        tipId: updated.id,
        recipientUserId: updated.recipientUserId,
        netCents: updated.netCents,
    });
    return toView(updated);
}

// Marks a captured tip as refunded (e.g. after a chargeback webhook). Reverses
// any reputation/notification side-effects via the emitted domain event.
export function refundTip(tipId: string): TipView | undefined {
    const existing = db.getTip(tipId);
    if (!existing) return undefined;
    if (existing.status === 'refunded') return toView(existing);
    const updated: TipRecord = {
        ...existing,
        status: 'refunded',
        refundedAt: nowIso(),
    };
    db.updateTip(updated);
    incrementCounter('tip_refunded_total', {
        providerId: updated.providerId,
        contextKind: updated.contextKind,
    });
    emitDomainEvent({
        module: 'monetization',
        type: 'tip.refunded',
        payload: {
            tipId: updated.id,
            recipientUserId: updated.recipientUserId,
            grossCents: updated.grossCents,
            netCents: updated.netCents,
        },
    });
    logEvent('tip.refunded', {
        tipId: updated.id,
        recipientUserId: updated.recipientUserId,
    });
    return toView(updated);
}

export function listTipsReceivedBy(userId: string, limit = 100): TipView[] {
    return db.listTipsByRecipient(userId, limit).map(toView);
}

export function listTipsSentBy(userId: string, limit = 100): TipView[] {
    return db.listTipsBySender(userId, limit).map(toView);
}

export function getTip(tipId: string): TipView | undefined {
    const record = db.getTip(tipId);
    return record ? toView(record) : undefined;
}

export function resetTipsForTest(): void {
    db.resetTipsForTest();
}

export const TIP_LIMITS = {
    minCents: MIN_TIP_CENTS,
    maxCents: MAX_TIP_CENTS,
    maxNoteLength: MAX_NOTE_LEN,
} as const;
