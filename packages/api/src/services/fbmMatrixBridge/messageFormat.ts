// Pure formatters that turn a parsed FBM bridge event into Matrix message
// content. No Matrix or DB access — fully unit-testable. Each formatter returns a
// complete `m.room.message` content object: a human-readable `body` (so any
// Matrix client shows something sensible) plus an embedded structured
// `co.bmc.marketplace.*` block (so Blackout clients can render a rich card),
// mirroring how scheduledMessageDispatcher embeds `co.blackout.scheduled`.

import {
    FBM_CUSTOMER_MESSAGE_EVENT_TYPE,
    FBM_CYCLE_EVENT_TYPE,
    FBM_DISPUTE_EVENT_TYPE,
    FBM_INVENTORY_EVENT_TYPE,
    FBM_LEDGER_EVENT_TYPE,
    FBM_MARKETPLACE_SCHEMA_VERSION,
    FBM_ORDER_EVENT_TYPE,
    FBM_VENDOR_METADATA_EVENT_TYPE,
    FBM_VENDOR_TRUST_EVENT_TYPE,
    type FbmCustomerMessageContent,
    type FbmCycleEventContent,
    type FbmDisputeEventContent,
    type FbmInventoryEventContent,
    type FbmLedgerEventContent,
    type FbmOrderEventContent,
    type FbmVendorTrustContent,
} from '@blackout/protocol';
import type {
    FbmCustomerMessageEvent,
    FbmCycleEvent,
    FbmInventoryLowEvent,
    FbmLedgerEvent,
    FbmOrderCancelledEvent,
    FbmOrderCreatedEvent,
    FbmOrderUpdatedEvent,
    FbmVendorTrustChangedEvent,
} from './events';
import { ledgerKindFromType } from './events';

const cycleKindFromType = (type: FbmCycleEvent['type']): FbmCycleEventContent['kind'] =>
    type === 'cycle.open' ? 'open' : type === 'cycle.close' ? 'close' : 'sold_out';

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

/** Render minor units (cents) as a localized-ish amount, e.g. 4200 → "$42.00". */
export function formatMoney(minorUnits: number, currency: string): string {
    const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()];
    const amount = (minorUnits / 100).toFixed(2);
    return symbol ? `${symbol}${amount}` : `${amount} ${currency.toUpperCase()}`;
}

/** Short, human-friendly order/dispute reference, e.g. "ord_8f3a91c2" → "8F3A". */
export function shortRef(id: string): string {
    const tail = id.replace(/[^a-zA-Z0-9]/g, '');
    return (tail.slice(-4) || tail || id).toUpperCase();
}

function summarizeItems(items: FbmOrderCreatedEvent['items']): string {
    if (items.length === 0) return 'items';
    return items.map((item) => `${item.qty}× ${item.title}`).join(', ');
}

export interface FormattedMessage {
    body: string;
    content: Record<string, unknown>;
}

function orderMessage(
    body: string,
    block: FbmOrderEventContent
): FormattedMessage {
    return {
        body,
        content: {
            msgtype: 'm.notice',
            body,
            [FBM_ORDER_EVENT_TYPE]: block,
        },
    };
}

export function formatOrderCreated(
    event: FbmOrderCreatedEvent,
    buyerAlias: string
): FormattedMessage {
    const body = `New order #${shortRef(event.orderId)} from ${buyerAlias} — ${summarizeItems(
        event.items
    )}. Total ${formatMoney(event.totalCents, event.currency)}.`;
    return orderMessage(body, {
        schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
        kind: 'created',
        orderId: event.orderId,
        vendorId: event.vendorId,
        buyerAlias,
        items: event.items,
        totalCents: event.totalCents,
        currency: event.currency,
        occurredAt: event.occurredAt,
    });
}

export function formatOrderUpdated(
    event: FbmOrderUpdatedEvent,
    buyerAlias: string
): FormattedMessage {
    const note = event.note ? ` — ${event.note}` : '';
    const body = `Order #${shortRef(event.orderId)} from ${buyerAlias} → ${event.status}${note}.`;
    return orderMessage(body, {
        schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
        kind: 'updated',
        orderId: event.orderId,
        vendorId: event.vendorId,
        buyerAlias,
        status: event.status,
        note: event.note,
        occurredAt: event.occurredAt,
    });
}

export function formatOrderCancelled(
    event: FbmOrderCancelledEvent,
    buyerAlias: string
): FormattedMessage {
    const reason = event.reason ? ` — ${event.reason}` : '';
    const body = `Order #${shortRef(event.orderId)} from ${buyerAlias} cancelled${reason}.`;
    return orderMessage(body, {
        schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
        kind: 'cancelled',
        orderId: event.orderId,
        vendorId: event.vendorId,
        buyerAlias,
        reason: event.reason,
        occurredAt: event.occurredAt,
    });
}

/** Buyer-facing status line posted into the buyer's own order room. */
export function formatBuyerOrderStatus(event: FbmOrderUpdatedEvent): FormattedMessage {
    const note = event.note ? ` ${event.note}` : '';
    const body = `Your order #${shortRef(event.orderId)} is now ${event.status}.${note}`;
    return {
        body,
        content: {
            msgtype: 'm.notice',
            body,
            [FBM_ORDER_EVENT_TYPE]: {
                schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
                kind: 'updated',
                orderId: event.orderId,
                vendorId: event.vendorId,
                buyerAlias: 'you',
                status: event.status,
                note: event.note,
                occurredAt: event.occurredAt,
            } satisfies FbmOrderEventContent,
        },
    };
}

export function formatInventoryLow(event: FbmInventoryLowEvent): FormattedMessage {
    const body = `Low stock: ${event.title} (${event.sku}) — ${event.remaining} left (threshold ${event.threshold}).`;
    return {
        body,
        content: {
            msgtype: 'm.notice',
            body,
            [FBM_INVENTORY_EVENT_TYPE]: {
                schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
                vendorId: event.vendorId,
                sku: event.sku,
                title: event.title,
                remaining: event.remaining,
                threshold: event.threshold,
                occurredAt: event.occurredAt,
            } satisfies FbmInventoryEventContent,
        },
    };
}

const LEDGER_LABELS: Record<FbmLedgerEvent['type'], string> = {
    'ledger.payment_received': 'Payment received',
    'ledger.escrow_released': 'Escrow released',
    'ledger.refund': 'Refund issued',
    'ledger.usdc_converted': 'USDC converted',
};

export function formatLedger(event: FbmLedgerEvent): FormattedMessage {
    const label = LEDGER_LABELS[event.type];
    const orderSuffix = event.orderId ? ` for order #${shortRef(event.orderId)}` : '';
    const body = `${label}: ${formatMoney(event.amountMinorUnits, event.currency)}${orderSuffix}.`;
    return {
        body,
        content: {
            msgtype: 'm.notice',
            body,
            [FBM_LEDGER_EVENT_TYPE]: {
                schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
                kind: ledgerKindFromType(event.type),
                vendorId: event.vendorId,
                orderId: event.orderId,
                amountMinorUnits: event.amountMinorUnits,
                currency: event.currency,
                ledgerTxId: event.ledgerTxId,
                occurredAt: event.occurredAt,
            } satisfies FbmLedgerEventContent,
        },
    };
}

/** Structured dispute state-event content (`co.bmc.marketplace.dispute`). */
export function disputeStateContent(
    disputeId: string,
    vendorId: string,
    status: 'open' | 'resolved',
    occurredAt: string,
    orderId?: string,
    outcome?: string
): FbmDisputeEventContent {
    return {
        schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
        disputeId,
        orderId,
        vendorId,
        status,
        outcome,
        occurredAt,
    };
}

export function formatCycle(event: FbmCycleEvent): FormattedMessage {
    let body: string;
    if (event.type === 'cycle.open') {
        const itemSummary = event.items?.length
            ? ` ${event.items.length} item${event.items.length === 1 ? '' : 's'} available.`
            : '';
        const closing = event.closingAt ? ` Closes ${event.closingAt}.` : '';
        const link = event.listingDeepLink ? ` ${event.listingDeepLink}` : '';
        body = `Order cycle "${event.name}" is open.${itemSummary}${closing}${link}`;
    } else if (event.type === 'cycle.close') {
        const placed =
            event.ordersPlaced !== undefined ? ` ${event.ordersPlaced} order(s) placed.` : '';
        const next = event.nextCycleAt ? ` Next cycle ${event.nextCycleAt}.` : '';
        body = `Order cycle "${event.name}" has closed.${placed}${next}`;
    } else {
        const sku = event.soldOutSku ? ` ${event.soldOutSku}` : '';
        body = `Sold out:${sku} in "${event.name}".`;
    }
    return {
        body,
        content: {
            msgtype: 'm.notice',
            body,
            [FBM_CYCLE_EVENT_TYPE]: {
                schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
                kind: cycleKindFromType(event.type),
                vendorId: event.vendorId,
                cycleId: event.cycleId,
                name: event.name,
                items: event.items,
                closingAt: event.closingAt,
                listingDeepLink: event.listingDeepLink,
                nextCycleAt: event.nextCycleAt,
                ordersPlaced: event.ordersPlaced,
                soldOutSku: event.soldOutSku,
                occurredAt: event.occurredAt,
            } satisfies FbmCycleEventContent,
        },
    };
}

export function formatCustomerMessage(
    event: FbmCustomerMessageEvent,
    buyerAlias: string
): FormattedMessage {
    const body = `${buyerAlias}: ${event.body}`;
    return {
        body,
        content: {
            msgtype: 'm.text',
            body,
            [FBM_CUSTOMER_MESSAGE_EVENT_TYPE]: {
                schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
                vendorId: event.vendorId,
                buyerAlias,
                body: event.body,
                threadId: event.threadId,
                occurredAt: event.occurredAt,
            } satisfies FbmCustomerMessageContent,
        },
    };
}

/** Structured vendor-trust state-event content (`co.bmc.vendor.trust`). */
export function vendorTrustStateContent(
    event: FbmVendorTrustChangedEvent
): FbmVendorTrustContent {
    return {
        schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
        vendorId: event.vendorId,
        verified: event.verified,
        tier: event.tier,
        completionRate: event.completionRate,
        disputeRate: event.disputeRate,
        coopStatus: event.coopStatus,
        occurredAt: event.occurredAt,
    };
}

export {
    FBM_DISPUTE_EVENT_TYPE,
    FBM_MARKETPLACE_SCHEMA_VERSION,
    FBM_VENDOR_METADATA_EVENT_TYPE,
    FBM_VENDOR_TRUST_EVENT_TYPE,
};
