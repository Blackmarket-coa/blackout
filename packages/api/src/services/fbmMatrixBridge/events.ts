// Parse path for "FBM → Matrix bridge" webhook events.
//
// The marketplace entitlement pipeline validates events against a *closed*
// lifecycle enum (`parseNormalizedLifecycleEvent` in @blackout/core). The bridge
// event families below (`order.*`, `inventory.*`, `ledger.*`, `subscription.*`,
// `dispute.*`) are deliberately NOT in that enum — they drive Matrix room
// activity, not entitlement grants. `parseFbmMatrixEvent` is the bridge's analog
// of `parseNormalizedLifecycleEvent`: it returns a typed event for a recognised
// family and `null` for anything else (including `purchase.*`), so the caller can
// fall through to the existing entitlement path untouched.

import type {
    FbmLedgerEventKind,
    FbmOrderStatus,
    FbmOrderLineItem,
} from '@blackout/protocol';

export type FbmSubscriptionTier = 'signal' | 'signal_plus' | 'community';

interface FbmMatrixEventBase {
    eventId: string;
    occurredAt: string;
    metadata: Record<string, unknown>;
}

export interface FbmOrderCreatedEvent extends FbmMatrixEventBase {
    type: 'order.created';
    vendorId: string;
    userId: string;
    orderId: string;
    items: FbmOrderLineItem[];
    totalCents: number;
    currency: string;
    vendorMxid?: string;
}

export interface FbmOrderUpdatedEvent extends FbmMatrixEventBase {
    type: 'order.updated';
    vendorId: string;
    userId: string;
    orderId: string;
    status: FbmOrderStatus;
    note?: string;
    vendorMxid?: string;
}

export interface FbmOrderCancelledEvent extends FbmMatrixEventBase {
    type: 'order.cancelled';
    vendorId: string;
    userId: string;
    orderId: string;
    reason?: string;
    vendorMxid?: string;
}

export interface FbmInventoryLowEvent extends FbmMatrixEventBase {
    type: 'inventory.low';
    vendorId: string;
    sku: string;
    title: string;
    remaining: number;
    threshold: number;
    vendorMxid?: string;
}

export interface FbmLedgerEvent extends FbmMatrixEventBase {
    type:
        | 'ledger.payment_received'
        | 'ledger.escrow_released'
        | 'ledger.refund'
        | 'ledger.usdc_converted';
    vendorId: string;
    orderId?: string;
    amountMinorUnits: number;
    currency: string;
    ledgerTxId: string;
    vendorMxid?: string;
}

export interface FbmSubscriptionActivatedEvent extends FbmMatrixEventBase {
    type: 'subscription.activated';
    userId: string;
    tier: FbmSubscriptionTier;
    subscriptionId: string;
    expiresAt?: string;
}

export interface FbmSubscriptionLapsedEvent extends FbmMatrixEventBase {
    type: 'subscription.lapsed';
    userId: string;
    tier: FbmSubscriptionTier;
    subscriptionId: string;
}

export interface FbmDisputeOpenedEvent extends FbmMatrixEventBase {
    type: 'dispute.opened';
    disputeId: string;
    vendorId: string;
    userId: string;
    orderId: string;
    reason?: string;
    vendorMxid?: string;
}

export interface FbmDisputeResolvedEvent extends FbmMatrixEventBase {
    type: 'dispute.resolved';
    disputeId: string;
    resolution?: string;
    outcome?: string;
}

export type FbmMatrixEvent =
    | FbmOrderCreatedEvent
    | FbmOrderUpdatedEvent
    | FbmOrderCancelledEvent
    | FbmInventoryLowEvent
    | FbmLedgerEvent
    | FbmSubscriptionActivatedEvent
    | FbmSubscriptionLapsedEvent
    | FbmDisputeOpenedEvent
    | FbmDisputeResolvedEvent;

export type FbmMatrixEventType = FbmMatrixEvent['type'];

const FBM_MATRIX_EVENT_TYPES: ReadonlySet<string> = new Set<FbmMatrixEventType>([
    'order.created',
    'order.updated',
    'order.cancelled',
    'inventory.low',
    'ledger.payment_received',
    'ledger.escrow_released',
    'ledger.refund',
    'ledger.usdc_converted',
    'subscription.activated',
    'subscription.lapsed',
    'dispute.opened',
    'dispute.resolved',
]);

const ORDER_STATUSES: ReadonlySet<string> = new Set<FbmOrderStatus>([
    'confirmed',
    'preparing',
    'dispatched',
    'delivered',
]);

const SUBSCRIPTION_TIERS: ReadonlySet<string> = new Set<FbmSubscriptionTier>([
    'signal',
    'signal_plus',
    'community',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(obj: Record<string, unknown>, key: string): string | undefined {
    const raw = obj[key];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function num(obj: Record<string, unknown>, key: string): number | undefined {
    const raw = obj[key];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function parseLineItems(raw: unknown): FbmOrderLineItem[] {
    if (!Array.isArray(raw)) return [];
    const items: FbmOrderLineItem[] = [];
    for (const entry of raw) {
        if (!isRecord(entry)) continue;
        const sku = str(entry, 'sku');
        const title = str(entry, 'title');
        const qty = num(entry, 'qty');
        const priceCents = num(entry, 'priceCents');
        if (!sku || !title || qty === undefined || priceCents === undefined) continue;
        items.push({ sku, title, qty, priceCents });
    }
    return items;
}

/**
 * Returns a typed `FbmMatrixEvent` for a recognised bridge family, or `null` for
 * any other payload (e.g. `purchase.succeeded`, malformed input). Never throws —
 * a `null` return is the signal to fall through to the entitlement pipeline.
 */
export function parseFbmMatrixEvent(payload: unknown): FbmMatrixEvent | null {
    if (!isRecord(payload)) return null;
    const type = payload.type;
    if (typeof type !== 'string' || !FBM_MATRIX_EVENT_TYPES.has(type)) return null;

    const eventId = str(payload, 'eventId');
    if (!eventId) return null;
    const occurredAt = str(payload, 'occurredAt') ?? new Date().toISOString();
    const metadata = isRecord(payload.metadata) ? payload.metadata : {};
    const base: FbmMatrixEventBase = { eventId, occurredAt, metadata };
    const vendorMxid = str(payload, 'vendorMxid');

    switch (type) {
        case 'order.created': {
            const vendorId = str(payload, 'vendorId');
            const userId = str(payload, 'userId');
            const orderId = str(payload, 'orderId');
            if (!vendorId || !userId || !orderId) return null;
            return {
                ...base,
                type,
                vendorId,
                userId,
                orderId,
                items: parseLineItems(payload.items),
                totalCents: num(payload, 'totalCents') ?? 0,
                currency: str(payload, 'currency') ?? 'USD',
                vendorMxid,
            };
        }
        case 'order.updated': {
            const vendorId = str(payload, 'vendorId');
            const userId = str(payload, 'userId');
            const orderId = str(payload, 'orderId');
            const status = str(payload, 'status');
            if (!vendorId || !userId || !orderId || !status || !ORDER_STATUSES.has(status)) {
                return null;
            }
            return {
                ...base,
                type,
                vendorId,
                userId,
                orderId,
                status: status as FbmOrderStatus,
                note: str(payload, 'note'),
                vendorMxid,
            };
        }
        case 'order.cancelled': {
            const vendorId = str(payload, 'vendorId');
            const userId = str(payload, 'userId');
            const orderId = str(payload, 'orderId');
            if (!vendorId || !userId || !orderId) return null;
            return {
                ...base,
                type,
                vendorId,
                userId,
                orderId,
                reason: str(payload, 'reason'),
                vendorMxid,
            };
        }
        case 'inventory.low': {
            const vendorId = str(payload, 'vendorId');
            const sku = str(payload, 'sku');
            const title = str(payload, 'title');
            const remaining = num(payload, 'remaining');
            if (!vendorId || !sku || !title || remaining === undefined) return null;
            return {
                ...base,
                type,
                vendorId,
                sku,
                title,
                remaining,
                threshold: num(payload, 'threshold') ?? 0,
                vendorMxid,
            };
        }
        case 'ledger.payment_received':
        case 'ledger.escrow_released':
        case 'ledger.refund':
        case 'ledger.usdc_converted': {
            const vendorId = str(payload, 'vendorId');
            const amountMinorUnits = num(payload, 'amountMinorUnits');
            const ledgerTxId = str(payload, 'ledgerTxId');
            if (!vendorId || amountMinorUnits === undefined || !ledgerTxId) return null;
            return {
                ...base,
                type: type as FbmLedgerEvent['type'],
                vendorId,
                orderId: str(payload, 'orderId'),
                amountMinorUnits,
                currency: str(payload, 'currency') ?? 'USD',
                ledgerTxId,
                vendorMxid,
            };
        }
        case 'subscription.activated': {
            const userId = str(payload, 'userId');
            const tier = str(payload, 'tier');
            const subscriptionId = str(payload, 'subscriptionId');
            if (!userId || !tier || !SUBSCRIPTION_TIERS.has(tier) || !subscriptionId) return null;
            return {
                ...base,
                type,
                userId,
                tier: tier as FbmSubscriptionTier,
                subscriptionId,
                expiresAt: str(payload, 'expiresAt'),
            };
        }
        case 'subscription.lapsed': {
            const userId = str(payload, 'userId');
            const tier = str(payload, 'tier');
            const subscriptionId = str(payload, 'subscriptionId');
            if (!userId || !tier || !SUBSCRIPTION_TIERS.has(tier) || !subscriptionId) return null;
            return {
                ...base,
                type,
                userId,
                tier: tier as FbmSubscriptionTier,
                subscriptionId,
            };
        }
        case 'dispute.opened': {
            const disputeId = str(payload, 'disputeId');
            const vendorId = str(payload, 'vendorId');
            const userId = str(payload, 'userId');
            const orderId = str(payload, 'orderId');
            if (!disputeId || !vendorId || !userId || !orderId) return null;
            return {
                ...base,
                type,
                disputeId,
                vendorId,
                userId,
                orderId,
                reason: str(payload, 'reason'),
                vendorMxid,
            };
        }
        case 'dispute.resolved': {
            const disputeId = str(payload, 'disputeId');
            if (!disputeId) return null;
            return {
                ...base,
                type,
                disputeId,
                resolution: str(payload, 'resolution'),
                outcome: str(payload, 'outcome'),
            };
        }
        default:
            return null;
    }
}

// `FbmLedgerEventKind` is re-exported so callers can map an event type to the
// content-block kind without re-deriving the suffix.
export const ledgerKindFromType = (
    type: FbmLedgerEvent['type']
): FbmLedgerEventKind => type.slice('ledger.'.length) as FbmLedgerEventKind;
