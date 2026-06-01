// Feature 1 (AOG §1, §2.3): per-vendor Matrix space + orders/inventory/ledger
// rooms, and buyer-facing per-order rooms. All Matrix operations are best-effort:
// a Synapse failure logs + counts but never throws, so the webhook still acks
// (graceful degradation, AOG §8.2).

import { randomUUID } from 'node:crypto';
import { db } from '../../db/store';
import type { FbmBuyerOrderRoomRecord, FbmVendorRoomRecord } from '../../db/types';
import { incrementCounter, logEvent } from '../marketplaceObservability';
import type { FbmBridgeMatrixClient } from './client';
import { buyerAliasForUserId, resolveBuyerMxid, resolveVendorMxid } from './identity';
import {
    FBM_VENDOR_METADATA_EVENT_TYPE,
    FBM_VENDOR_TRUST_EVENT_TYPE,
    FBM_MARKETPLACE_SCHEMA_VERSION,
    formatBuyerOrderStatus,
    formatCustomerMessage,
    formatCycle,
    formatInventoryLow,
    formatLedger,
    formatOrderCancelled,
    formatOrderCreated,
    formatOrderUpdated,
    vendorTrustStateContent,
} from './messageFormat';
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

const nowIso = (): string => new Date().toISOString();

const homeserverDomain = (): string =>
    (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');

function failed(feature: string, action: string, detail?: unknown): void {
    incrementCounter('fbm_matrix_bridge_action_failed_total', { feature, action });
    logEvent('marketplace.fbm_bridge.action_failed', { feature, action, detail });
}

/**
 * Idempotently provision (or look up) a vendor's Matrix space and its three child
 * rooms. Returns `null` if Matrix is unreachable / unconfigured or space creation
 * fails — callers then skip posting but the webhook still succeeds.
 */
export async function ensureVendorSpace(
    vendorId: string,
    matrix: FbmBridgeMatrixClient,
    opts: { vendorMxid?: string } = {}
): Promise<FbmVendorRoomRecord | null> {
    const existing = db.getFbmVendorRooms(vendorId);
    if (existing) return existing;

    const space = await matrix.createRoom({
        name: `Vendor ${vendorId}`,
        topic: `FBM vendor ${vendorId}`,
        visibility: 'private',
        preset: 'private_chat',
        creationContent: { type: 'm.space' },
    });
    if (!space.ok || !('roomId' in space) || !space.roomId) {
        failed('vendor_rooms', 'create_space', 'reason' in space ? space.reason : space.status);
        return null;
    }
    const spaceRoomId = space.roomId;

    const childRoomIds: Record<'orders' | 'inventory' | 'ledger', string> = {
        orders: '',
        inventory: '',
        ledger: '',
    };
    for (const child of ['orders', 'inventory', 'ledger'] as const) {
        const room = await matrix.createRoom({
            name: `${vendorId} — ${child}`,
            visibility: 'private',
            preset: 'private_chat',
        });
        if (!room.ok || !('roomId' in room) || !room.roomId) {
            failed('vendor_rooms', `create_${child}_room`, 'reason' in room ? room.reason : room.status);
            return null;
        }
        childRoomIds[child] = room.roomId;
        // Link the child into the space (best-effort; non-fatal).
        await matrix.sendStateEvent(
            spaceRoomId,
            'm.space.child',
            { via: [homeserverDomain()] },
            room.roomId
        );
        await matrix.sendStateEvent(
            room.roomId,
            'm.space.parent',
            { via: [homeserverDomain()], canonical: true },
            spaceRoomId
        );
    }

    const record: FbmVendorRoomRecord = {
        vendorId,
        spaceRoomId,
        ordersRoomId: childRoomIds.orders,
        inventoryRoomId: childRoomIds.inventory,
        ledgerRoomId: childRoomIds.ledger,
        createdAt: nowIso(),
    };
    db.upsertFbmVendorRooms(record);
    incrementCounter('fbm_matrix_vendor_room_created_total', {});

    // Invite the vendor to their own space (best-effort).
    const vendorMxid = resolveVendorMxid(vendorId, opts.vendorMxid);
    if (vendorMxid) {
        await matrix.inviteToRoom(spaceRoomId, vendorMxid, 'FBM vendor space');
    }
    return record;
}

export async function ensureBuyerOrderRoom(
    orderId: string,
    vendorId: string,
    buyerUserId: string,
    matrix: FbmBridgeMatrixClient
): Promise<FbmBuyerOrderRoomRecord | null> {
    const existing = db.getFbmBuyerOrderRoom(orderId);
    if (existing) return existing;

    const room = await matrix.createRoom({
        name: `Order ${orderId}`,
        topic: `FBM order ${orderId}`,
        visibility: 'private',
        preset: 'private_chat',
    });
    if (!room.ok || !('roomId' in room) || !room.roomId) {
        failed('vendor_rooms', 'create_buyer_order_room', 'reason' in room ? room.reason : room.status);
        return null;
    }
    const record: FbmBuyerOrderRoomRecord = {
        id: randomUUID(),
        vendorId,
        buyerUserId,
        orderId,
        roomId: room.roomId,
        createdAt: nowIso(),
    };
    db.upsertFbmBuyerOrderRoom(record);

    const buyerMxid = resolveBuyerMxid(buyerUserId);
    if (buyerMxid) {
        const invited = await matrix.inviteToRoom(room.roomId, buyerMxid, 'Your FBM order');
        if (!invited.ok) await matrix.adminJoinUserToRoom(room.roomId, buyerMxid);
    }
    return record;
}

async function postToOrdersRoom(
    vendorId: string,
    matrix: FbmBridgeMatrixClient,
    content: Record<string, unknown>,
    vendorMxid?: string
): Promise<void> {
    const rooms = await ensureVendorSpace(vendorId, matrix, { vendorMxid });
    if (!rooms) return;
    const sent = await matrix.sendEvent(rooms.ordersRoomId, content);
    if (!sent.ok) failed('vendor_rooms', 'post_order', 'reason' in sent ? sent.reason : sent.status);
}

export async function postOrderCreated(
    event: FbmOrderCreatedEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const alias = buyerAliasForUserId(event.userId, event.vendorId);
    await postToOrdersRoom(
        event.vendorId,
        matrix,
        formatOrderCreated(event, alias).content,
        event.vendorMxid
    );
}

export async function postOrderUpdated(
    event: FbmOrderUpdatedEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const alias = buyerAliasForUserId(event.userId, event.vendorId);
    await postToOrdersRoom(
        event.vendorId,
        matrix,
        formatOrderUpdated(event, alias).content,
        event.vendorMxid
    );

    // Also push the status to the buyer's own order room.
    const buyerRoom = await ensureBuyerOrderRoom(
        event.orderId,
        event.vendorId,
        event.userId,
        matrix
    );
    if (buyerRoom) {
        const sent = await matrix.sendEvent(buyerRoom.roomId, formatBuyerOrderStatus(event).content);
        if (!sent.ok) {
            failed('vendor_rooms', 'post_buyer_status', 'reason' in sent ? sent.reason : sent.status);
        }
    }
}

export async function postOrderCancelled(
    event: FbmOrderCancelledEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const alias = buyerAliasForUserId(event.userId, event.vendorId);
    await postToOrdersRoom(
        event.vendorId,
        matrix,
        formatOrderCancelled(event, alias).content,
        event.vendorMxid
    );
}

export async function postInventoryLow(
    event: FbmInventoryLowEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const rooms = await ensureVendorSpace(event.vendorId, matrix, { vendorMxid: event.vendorMxid });
    if (!rooms) return;
    const sent = await matrix.sendEvent(rooms.inventoryRoomId, formatInventoryLow(event).content);
    if (!sent.ok) failed('vendor_rooms', 'post_inventory', 'reason' in sent ? sent.reason : sent.status);
}

export async function postLedger(
    event: FbmLedgerEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const rooms = await ensureVendorSpace(event.vendorId, matrix, { vendorMxid: event.vendorMxid });
    if (!rooms) return;
    const sent = await matrix.sendEvent(rooms.ledgerRoomId, formatLedger(event).content);
    if (!sent.ok) failed('vendor_rooms', 'post_ledger', 'reason' in sent ? sent.reason : sent.status);
}

// --- Phase 2: lazily-provisioned extra rooms -------------------------------

/** Provision (once) and return a vendor child room id stored on the mapping. */
async function ensureVendorChildRoom(
    vendorId: string,
    matrix: FbmBridgeMatrixClient,
    field: 'announceRoomId' | 'customerMessagesRoomId',
    create: () => Parameters<FbmBridgeMatrixClient['createRoom']>[0],
    vendorMxid?: string
): Promise<{ rooms: FbmVendorRoomRecord; roomId: string } | null> {
    const rooms = await ensureVendorSpace(vendorId, matrix, { vendorMxid });
    if (!rooms) return null;
    const existing = rooms[field];
    if (existing) return { rooms, roomId: existing };

    const room = await matrix.createRoom(create());
    if (!room.ok || !('roomId' in room) || !room.roomId) {
        failed('vendor_rooms', `create_${field}`, 'reason' in room ? room.reason : room.status);
        return null;
    }
    // Link into the vendor's space (best-effort).
    await matrix.sendStateEvent(
        rooms.spaceRoomId,
        'm.space.child',
        { via: [homeserverDomain()] },
        room.roomId
    );
    await matrix.sendStateEvent(
        room.roomId,
        'm.space.parent',
        { via: [homeserverDomain()], canonical: true },
        rooms.spaceRoomId
    );
    const updated: FbmVendorRoomRecord = { ...rooms, [field]: room.roomId };
    db.upsertFbmVendorRooms(updated);
    return { rooms: updated, roomId: room.roomId };
}

/** §1.2 — broadcast Order Cycle open/close/sold-out to the public announce room. */
export async function postCycle(
    event: FbmCycleEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const provisioned = await ensureVendorChildRoom(
        event.vendorId,
        matrix,
        'announceRoomId',
        () => ({
            name: `${event.vendorId} — order cycles`,
            topic: `FBM Order Cycle announcements for ${event.vendorId}`,
            // Public so customers can self-join for real-time cycle notifications.
            visibility: 'public',
            preset: 'public_chat',
        }),
        event.vendorMxid
    );
    if (!provisioned) return;
    const sent = await matrix.sendEvent(provisioned.roomId, formatCycle(event).content);
    if (!sent.ok) failed('vendor_rooms', 'post_cycle', 'reason' in sent ? sent.reason : sent.status);
}

/** §6 — broadcast an already-formatted flash-sale notice to the public announce room. */
export async function postFlashSaleAnnouncement(
    vendorId: string,
    matrix: FbmBridgeMatrixClient,
    content: Record<string, unknown>,
    vendorMxid?: string
): Promise<boolean> {
    const provisioned = await ensureVendorChildRoom(
        vendorId,
        matrix,
        'announceRoomId',
        () => ({
            name: `${vendorId} — order cycles`,
            topic: `FBM announcements for ${vendorId}`,
            visibility: 'public',
            preset: 'public_chat',
        }),
        vendorMxid
    );
    if (!provisioned) return false;
    const sent = await matrix.sendEvent(provisioned.roomId, content);
    if (!sent.ok) {
        failed('vendor_rooms', 'post_flash_sale', 'reason' in sent ? sent.reason : sent.status);
        return false;
    }
    return true;
}

/** §1.1 — bridge a buyer storefront inquiry into the vendor's customer-messages room. */
export async function postCustomerMessage(
    event: FbmCustomerMessageEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const provisioned = await ensureVendorChildRoom(
        event.vendorId,
        matrix,
        'customerMessagesRoomId',
        () => ({
            name: `${event.vendorId} — customer messages`,
            topic: `FBM storefront inquiries for ${event.vendorId}`,
            visibility: 'private',
            preset: 'private_chat',
        }),
        event.vendorMxid
    );
    if (!provisioned) return;
    const alias = buyerAliasForUserId(event.userId, event.vendorId);
    const sent = await matrix.sendEvent(
        provisioned.roomId,
        formatCustomerMessage(event, alias).content
    );
    if (!sent.ok) {
        failed('vendor_rooms', 'post_customer_message', 'reason' in sent ? sent.reason : sent.status);
    }
}

/** §2.2 — stamp the vendor trust badge as a state event on the vendor's space + rooms. */
export async function applyVendorTrust(
    event: FbmVendorTrustChangedEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const rooms = await ensureVendorSpace(event.vendorId, matrix, { vendorMxid: event.vendorMxid });
    if (!rooms) return;
    const content = { ...vendorTrustStateContent(event) };
    // State key = vendorId so a buyer can look the badge up by vendor; written to
    // the space (discoverable) and the orders room (where buyers interact).
    //
    // The trust event is keyed by vendorId, which a client cannot otherwise
    // derive from a roomId. We therefore also stamp a `co.bmc.vendor.metadata`
    // state event with an EMPTY state key on the same rooms, binding room ->
    // vendorId so the client can read metadata first, then the trust badge.
    const metadata = {
        schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
        vendorId: event.vendorId,
    };
    for (const roomId of [rooms.spaceRoomId, rooms.ordersRoomId]) {
        const written = await matrix.sendStateEvent(
            roomId,
            FBM_VENDOR_TRUST_EVENT_TYPE,
            content,
            event.vendorId
        );
        if (!written.ok) {
            failed('vendor_rooms', 'apply_vendor_trust', 'reason' in written ? written.reason : written.status);
        }
        const meta = await matrix.sendStateEvent(roomId, FBM_VENDOR_METADATA_EVENT_TYPE, metadata, '');
        if (!meta.ok) {
            failed('vendor_rooms', 'apply_vendor_metadata', 'reason' in meta ? meta.reason : meta.status);
        }
    }
    incrementCounter('fbm_matrix_vendor_trust_applied_total', { tier: event.tier });
}
