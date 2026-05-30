// Custom Matrix event types for the FBM → Matrix bridge.
//
// FreeBlackMarket (the cooperative economic substrate) emits webhook events for
// orders, inventory, ledger settlement, subscriptions, and disputes. The
// Blackout API's `fbmMatrixBridge` service translates those into Matrix room
// activity. The bot posts a human-readable `m.room.message` carrying an embedded
// structured block under one of the `co.bmc.marketplace.*` keys below — mirroring
// how the scheduled-message dispatcher embeds `co.blackout.scheduled`. Blackout
// clients can render a rich card from the structured block; any other Matrix
// client still sees the plain `body`.
//
// These describe the *Matrix event content* shape (not the internal Blackout
// event-bus `EventEnvelope`), so they are deliberately standalone payload
// interfaces with structural guards.

export const FBM_ORDER_EVENT_TYPE = 'co.bmc.marketplace.order';
export const FBM_INVENTORY_EVENT_TYPE = 'co.bmc.marketplace.inventory';
export const FBM_LEDGER_EVENT_TYPE = 'co.bmc.marketplace.ledger';
export const FBM_DISPUTE_EVENT_TYPE = 'co.bmc.marketplace.dispute';
export const FBM_DEADDROP_POINTER_EVENT_TYPE = 'co.bmc.marketplace.deaddrop';

/** Bumped when any `co.bmc.marketplace.*` content shape changes incompatibly. */
export const FBM_MARKETPLACE_SCHEMA_VERSION = 1;

export type FbmOrderEventKind = 'created' | 'updated' | 'cancelled';
export type FbmOrderStatus =
    | 'confirmed'
    | 'preparing'
    | 'dispatched'
    | 'delivered';

export interface FbmOrderLineItem {
    sku: string;
    title: string;
    qty: number;
    priceCents: number;
}

export interface FbmOrderEventContent {
    schemaVersion: number;
    kind: FbmOrderEventKind;
    orderId: string;
    vendorId: string;
    /** Pseudonymous buyer alias — never the buyer's real MXID (privacy by default). */
    buyerAlias: string;
    status?: FbmOrderStatus;
    items?: FbmOrderLineItem[];
    totalCents?: number;
    currency?: string;
    note?: string;
    reason?: string;
    occurredAt: string;
}

export type FbmLedgerEventKind =
    | 'payment_received'
    | 'escrow_released'
    | 'refund'
    | 'usdc_converted';

export interface FbmLedgerEventContent {
    schemaVersion: number;
    kind: FbmLedgerEventKind;
    vendorId: string;
    orderId?: string;
    amountMinorUnits: number;
    currency: string;
    ledgerTxId: string;
    occurredAt: string;
}

export interface FbmInventoryEventContent {
    schemaVersion: number;
    vendorId: string;
    sku: string;
    title: string;
    remaining: number;
    threshold: number;
    occurredAt: string;
}

export type FbmDisputeStatus = 'open' | 'resolved';

export interface FbmDisputeEventContent {
    schemaVersion: number;
    disputeId: string;
    orderId?: string;
    vendorId: string;
    status: FbmDisputeStatus;
    outcome?: string;
    occurredAt: string;
}

const isContent = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const isFbmOrderEventContent = (
    value: unknown
): value is FbmOrderEventContent =>
    isContent(value) &&
    typeof value.orderId === 'string' &&
    typeof value.vendorId === 'string' &&
    typeof value.buyerAlias === 'string' &&
    (value.kind === 'created' || value.kind === 'updated' || value.kind === 'cancelled');

export const isFbmLedgerEventContent = (
    value: unknown
): value is FbmLedgerEventContent =>
    isContent(value) &&
    typeof value.vendorId === 'string' &&
    typeof value.amountMinorUnits === 'number' &&
    typeof value.ledgerTxId === 'string';

export const isFbmInventoryEventContent = (
    value: unknown
): value is FbmInventoryEventContent =>
    isContent(value) &&
    typeof value.vendorId === 'string' &&
    typeof value.sku === 'string' &&
    typeof value.remaining === 'number';

export const isFbmDisputeEventContent = (
    value: unknown
): value is FbmDisputeEventContent =>
    isContent(value) &&
    typeof value.disputeId === 'string' &&
    typeof value.vendorId === 'string' &&
    (value.status === 'open' || value.status === 'resolved');
