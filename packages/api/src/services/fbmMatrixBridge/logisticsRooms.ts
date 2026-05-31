// Phase 3 — Blackstar logistics bridge (AOG §7). FBM (which absorbed Blackstar's
// logistics responsibilities) emits `blackstar.*` delivery-lifecycle events; we
// fan them into the vendor's orders room and the buyer's own order room, and post
// delivery failures to a shared escalation room so a vendor can reattempt /
// refund / escalate without leaving Blackout. All best-effort: a Matrix failure
// logs + counts, never throws.

import {
    FBM_LOGISTICS_EVENT_TYPE,
    FBM_MARKETPLACE_SCHEMA_VERSION,
    type FbmLogisticsEventContent,
} from '@blackout/protocol';
import { incrementCounter, logEvent } from '../marketplaceObservability';
import type { FbmBridgeMatrixClient } from './client';
import { buyerAliasForUserId } from './identity';
import { logisticsKindFromType, type FbmLogisticsEvent } from './events';
import { ensureBuyerOrderRoom, ensureVendorSpace } from './vendorRooms';

function failed(action: string, detail?: unknown): void {
    incrementCounter('fbm_matrix_bridge_action_failed_total', { feature: 'logistics', action });
    logEvent('marketplace.fbm_bridge.action_failed', { feature: 'logistics', action, detail });
}

const LABELS: Record<FbmLogisticsEvent['type'], string> = {
    'blackstar.driver_assigned': 'Driver assigned',
    'blackstar.pickup_confirmed': 'Pickup confirmed',
    'blackstar.delivered': 'Delivery completed',
    'blackstar.failed': 'Delivery failed',
};

const escalationRoomAlias = (): string | undefined =>
    process.env.FBM_LOGISTICS_ESCALATION_ROOM?.trim() || undefined;

function vendorBody(event: FbmLogisticsEvent, buyerAlias: string): string {
    const ref = `#${shortRef(event.orderId)}`;
    switch (event.type) {
        case 'blackstar.driver_assigned': {
            const driver = event.driverName ? ` ${event.driverName}` : '';
            const vehicle = event.vehicleType ? ` (${event.vehicleType})` : '';
            const eta = event.etaPickup ? `, pickup ~${event.etaPickup}` : '';
            return `Driver assigned${driver}${vehicle} for order ${ref} (${buyerAlias})${eta}.`;
        }
        case 'blackstar.pickup_confirmed': {
            const eta = event.etaDelivery ? `, delivery ~${event.etaDelivery}` : '';
            return `Order ${ref} (${buyerAlias}) collected${eta}.`;
        }
        case 'blackstar.delivered':
            return `Order ${ref} (${buyerAlias}) delivered.`;
        case 'blackstar.failed': {
            const reason = event.failureReason ? ` — ${event.failureReason}` : '';
            return `Delivery failed for order ${ref} (${buyerAlias})${reason}.`;
        }
    }
}

function buyerBody(event: FbmLogisticsEvent): string {
    const ref = `#${shortRef(event.orderId)}`;
    switch (event.type) {
        case 'blackstar.driver_assigned':
            return `A driver is assigned to your order ${ref}.${
                event.trackingUrl ? ` Track: ${event.trackingUrl}` : ''
            }`;
        case 'blackstar.pickup_confirmed':
            return `Your order ${ref} is on the way.${
                event.etaDelivery ? ` ETA ${event.etaDelivery}.` : ''
            }`;
        case 'blackstar.delivered':
            return `Your order ${ref} has been delivered.`;
        case 'blackstar.failed':
            return `Delivery of your order ${ref} could not be completed. The vendor has been notified.`;
    }
}

function shortRef(id: string): string {
    const tail = id.replace(/[^a-zA-Z0-9]/g, '');
    return (tail.slice(-4) || tail || id).toUpperCase();
}

function content(event: FbmLogisticsEvent, buyerAlias: string | undefined, body: string): Record<string, unknown> {
    const block: FbmLogisticsEventContent = {
        schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
        kind: logisticsKindFromType(event.type),
        vendorId: event.vendorId,
        orderId: event.orderId,
        buyerAlias,
        driverName: event.driverName,
        vehicleType: event.vehicleType,
        etaPickup: event.etaPickup,
        etaDelivery: event.etaDelivery,
        trackingUrl: event.trackingUrl,
        proof: event.proof,
        failureReason: event.failureReason,
        occurredAt: event.occurredAt,
    };
    return { msgtype: 'm.notice', body, [FBM_LOGISTICS_EVENT_TYPE]: block };
}

export async function postLogistics(
    event: FbmLogisticsEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const alias = buyerAliasForUserId(event.userId, event.vendorId);

    // Vendor notification → orders room.
    const rooms = await ensureVendorSpace(event.vendorId, matrix, { vendorMxid: event.vendorMxid });
    if (rooms) {
        const sent = await matrix.sendEvent(
            rooms.ordersRoomId,
            content(event, alias, `${LABELS[event.type]}: ${vendorBody(event, alias)}`)
        );
        if (!sent.ok) failed('post_vendor', 'reason' in sent ? sent.reason : sent.status);
    }

    // Buyer notification → their order room (no pseudonym needed in their own room).
    const buyerRoom = await ensureBuyerOrderRoom(event.orderId, event.vendorId, event.userId, matrix);
    if (buyerRoom) {
        const sent = await matrix.sendEvent(buyerRoom.roomId, content(event, undefined, buyerBody(event)));
        if (!sent.ok) failed('post_buyer', 'reason' in sent ? sent.reason : sent.status);
    }

    // Failures also post to a shared escalation room when configured.
    if (event.type === 'blackstar.failed') {
        const alias2 = alias;
        const roomRef = escalationRoomAlias();
        if (roomRef) {
            const sent = await matrix.sendEvent(
                roomRef,
                content(event, alias2, `Delivery failed — vendor ${event.vendorId}, order #${shortRef(event.orderId)} (${alias2}).`)
            );
            if (!sent.ok) failed('post_escalation', 'reason' in sent ? sent.reason : sent.status);
        }
        incrementCounter('fbm_matrix_logistics_failed_total', {});
    }
}
