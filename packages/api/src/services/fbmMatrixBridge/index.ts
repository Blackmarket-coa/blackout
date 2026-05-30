// FBM → Matrix bridge entry point. `dispatchMarketplaceWebhook` hands recognised
// bridge events here (after signature verification + receipt). This module owns:
//   - replay idempotency (shared marketplace webhook-audit table),
//   - the master feature-flag gate,
//   - the global try/catch so a Matrix outage never fails the webhook (AOG §8.2).
// It always returns a `WebhookDispatchResult`-shaped 200 ack so FBM does not
// retry-storm; the room side-effects are best-effort within.

import type { MarketplaceProvider } from '@blackout/core';
import {
    hasProcessedWebhookEvent,
    markWebhookProcessed,
    type ApplyEventResult,
} from '../marketplaceEntitlements';
import { incrementCounter, logEvent } from '../marketplaceObservability';
import { bridgeEnabled } from './config';
import { defaultMatrixClient, type FbmBridgeMatrixClient } from './client';
import type { FbmMatrixEvent } from './events';
import {
    applyVendorTrust,
    postCustomerMessage,
    postCycle,
    postInventoryLow,
    postLedger,
    postOrderCancelled,
    postOrderCreated,
    postOrderUpdated,
} from './vendorRooms';
import { applySubscriptionActivated, applySubscriptionLapsed } from './subscriptionRooms';
import { openDisputeRoom, resolveDisputeRoom } from './disputeRooms';
import { postLogistics } from './logisticsRooms';
import { startFlashSale } from './flashMob';

export interface FbmBridgeDeps {
    matrixClient?: FbmBridgeMatrixClient;
}

// Mirrors the `WebhookDispatchResult` shape from marketplaceWebhook (a type-only
// dependency would create a confusing import cycle; the shape is small + stable).
interface BridgeDispatchResult {
    ok: boolean;
    status: number;
    applied: ApplyEventResult;
}

const ack = (alreadyProcessed: boolean): BridgeDispatchResult => ({
    ok: true,
    status: 200,
    applied: { entitlement: null, licenseKey: null, alreadyProcessed },
});

async function route(event: FbmMatrixEvent, matrix: FbmBridgeMatrixClient): Promise<void> {
    switch (event.type) {
        case 'order.created':
            return postOrderCreated(event, matrix);
        case 'order.updated':
            return postOrderUpdated(event, matrix);
        case 'order.cancelled':
            return postOrderCancelled(event, matrix);
        case 'inventory.low':
            return postInventoryLow(event, matrix);
        case 'ledger.payment_received':
        case 'ledger.escrow_released':
        case 'ledger.refund':
        case 'ledger.usdc_converted':
            return postLedger(event, matrix);
        case 'subscription.activated':
            return applySubscriptionActivated(event, matrix);
        case 'subscription.lapsed':
            return applySubscriptionLapsed(event, matrix);
        case 'dispute.opened':
            return openDisputeRoom(event, matrix);
        case 'dispute.resolved':
            return resolveDisputeRoom(event, matrix);
        case 'cycle.open':
        case 'cycle.close':
        case 'sold_out':
            return postCycle(event, matrix);
        case 'message.sent':
            return postCustomerMessage(event, matrix);
        case 'vendor.trust_changed':
            return applyVendorTrust(event, matrix);
        case 'blackstar.driver_assigned':
        case 'blackstar.pickup_confirmed':
        case 'blackstar.delivered':
        case 'blackstar.failed':
            return postLogistics(event, matrix);
        case 'flash_sale.start':
            return startFlashSale(event, matrix);
    }
}

export async function dispatchFbmMatrixEvent(
    provider: MarketplaceProvider,
    event: FbmMatrixEvent,
    deps: FbmBridgeDeps = {}
): Promise<BridgeDispatchResult> {
    if (hasProcessedWebhookEvent(provider.id, event.eventId)) {
        logEvent('marketplace.fbm_bridge.replay', {
            providerId: provider.id,
            eventId: event.eventId,
            eventType: event.type,
        });
        return ack(true);
    }

    if (!bridgeEnabled()) {
        markWebhookProcessed(provider.id, event.eventId);
        incrementCounter('fbm_matrix_bridge_skipped_total', { type: event.type });
        return ack(false);
    }

    const matrix = deps.matrixClient ?? defaultMatrixClient;
    try {
        await route(event, matrix);
        incrementCounter('fbm_matrix_bridge_dispatched_total', { type: event.type });
    } catch (err) {
        // Never propagate — the commerce path must stay independent of Matrix.
        incrementCounter('fbm_matrix_bridge_action_failed_total', {
            feature: 'dispatch',
            action: event.type,
        });
        logEvent('marketplace.fbm_bridge.dispatch_threw', {
            providerId: provider.id,
            eventId: event.eventId,
            eventType: event.type,
            detail: err instanceof Error ? err.message : String(err),
        });
    }

    markWebhookProcessed(provider.id, event.eventId);
    return ack(false);
}

export { parseFbmMatrixEvent } from './events';
export type { FbmMatrixEvent } from './events';
