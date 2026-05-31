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
export const FBM_CYCLE_EVENT_TYPE = 'co.bmc.marketplace.cycle';
export const FBM_CUSTOMER_MESSAGE_EVENT_TYPE = 'co.bmc.marketplace.customer_message';
/** Vendor trust badge — written as a room *state* event (state key = vendorId). */
export const FBM_VENDOR_TRUST_EVENT_TYPE = 'co.bmc.vendor.trust';

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

export type FbmCycleEventKind = 'open' | 'close' | 'sold_out';

export interface FbmCycleAvailableItem {
    sku: string;
    title: string;
}

export interface FbmCycleEventContent {
    schemaVersion: number;
    kind: FbmCycleEventKind;
    vendorId: string;
    cycleId: string;
    name: string;
    items?: FbmCycleAvailableItem[];
    closingAt?: string;
    listingDeepLink?: string;
    nextCycleAt?: string;
    ordersPlaced?: number;
    soldOutSku?: string;
    occurredAt: string;
}

export interface FbmCustomerMessageContent {
    schemaVersion: number;
    vendorId: string;
    /** Pseudonymous buyer alias — never the buyer's real MXID. */
    buyerAlias: string;
    body: string;
    threadId?: string;
    occurredAt: string;
}

export type FbmVendorTrustTier = 'unverified' | 'verified' | 'trusted' | 'flagged';

export interface FbmVendorTrustContent {
    schemaVersion: number;
    vendorId: string;
    verified: boolean;
    tier: FbmVendorTrustTier;
    /** 0..1 fraction; e.g. 0.98. */
    completionRate?: number;
    /** 0..1 fraction; e.g. 0.01. */
    disputeRate?: number;
    coopStatus?: string;
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

export const isFbmCycleEventContent = (
    value: unknown
): value is FbmCycleEventContent =>
    isContent(value) &&
    typeof value.vendorId === 'string' &&
    typeof value.cycleId === 'string' &&
    (value.kind === 'open' || value.kind === 'close' || value.kind === 'sold_out');

export const isFbmCustomerMessageContent = (
    value: unknown
): value is FbmCustomerMessageContent =>
    isContent(value) &&
    typeof value.vendorId === 'string' &&
    typeof value.buyerAlias === 'string' &&
    typeof value.body === 'string';

export const isFbmVendorTrustContent = (
    value: unknown
): value is FbmVendorTrustContent =>
    isContent(value) &&
    typeof value.vendorId === 'string' &&
    typeof value.verified === 'boolean';
