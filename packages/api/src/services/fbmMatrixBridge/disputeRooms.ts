// Feature 4 (AOG §5): three-party encrypted dispute rooms. On `dispute.opened` a
// private encrypted room is created with the buyer, the vendor, and an
// auto-assigned mediator; the FBM dispute id is embedded in the room topic and a
// `co.bmc.marketplace.dispute` state event. On `dispute.resolved` the room is set
// read-only and scheduled for purge after the retention window (§5.2).
//
// Participant chat is E2EE; the bot posts dispute *status* as an unencrypted
// state event (the bot is not a Megolm member), so the audit metadata stays
// readable while the conversation itself remains end-to-end encrypted.

import { db } from '../../db/store';
import type { FbmDisputeRoomRecord } from '../../db/types';
import { incrementCounter, logEvent } from '../marketplaceObservability';
import { disputeRetentionDays, mediatorPool } from './config';
import type { FbmBridgeMatrixClient } from './client';
import { resolveBuyerMxid, resolveVendorMxid } from './identity';
import { FBM_DISPUTE_EVENT_TYPE, disputeStateContent } from './messageFormat';
import type { FbmDisputeOpenedEvent, FbmDisputeResolvedEvent } from './events';

const nowIso = (): string => new Date().toISOString();

function failed(action: string, detail?: unknown): void {
    incrementCounter('fbm_matrix_bridge_action_failed_total', { feature: 'dispute_rooms', action });
    logEvent('marketplace.fbm_bridge.action_failed', { feature: 'dispute_rooms', action, detail });
}

/** Stable round-robin mediator pick keyed off the dispute id (no shared cursor). */
function pickMediator(disputeId: string): string | null {
    const pool = mediatorPool();
    if (pool.length === 0) return null;
    let hash = 0;
    for (const ch of disputeId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return pool[hash % pool.length];
}

export async function openDisputeRoom(
    event: FbmDisputeOpenedEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    if (db.getFbmDisputeRoom(event.disputeId)) return; // idempotent

    const room = await matrix.createRoom({
        name: `Dispute ${event.disputeId}`,
        topic: `FBM dispute ${event.disputeId}`,
        visibility: 'private',
        preset: 'private_chat',
    });
    if (!room.ok || !('roomId' in room) || !room.roomId) {
        failed('create_room', 'reason' in room ? room.reason : room.status);
        return;
    }
    const roomId = room.roomId;

    await matrix.sendStateEvent(roomId, 'm.room.encryption', {
        algorithm: 'm.megolm.v1.aes-sha2',
    });
    await matrix.sendStateEvent(roomId, 'm.room.history_visibility', {
        history_visibility: 'joined',
    });
    await matrix.sendStateEvent(
        roomId,
        FBM_DISPUTE_EVENT_TYPE,
        { ...disputeStateContent(event.disputeId, event.vendorId, 'open', event.occurredAt, event.orderId) },
        event.disputeId
    );

    const buyerMxid = resolveBuyerMxid(event.userId);
    const vendorMxid = resolveVendorMxid(event.vendorId, event.vendorMxid);
    const mediatorMxid = pickMediator(event.disputeId);
    for (const mxid of [buyerMxid, vendorMxid, mediatorMxid]) {
        if (mxid) await matrix.inviteToRoom(roomId, mxid, 'FBM dispute');
    }

    const record: FbmDisputeRoomRecord = {
        disputeId: event.disputeId,
        orderId: event.orderId,
        vendorId: event.vendorId,
        buyerUserId: event.userId,
        mediatorUserId: mediatorMxid,
        roomId,
        status: 'open',
        openedAt: event.occurredAt,
        resolvedAt: null,
        purgeAfter: null,
        purgedAt: null,
        createdAt: nowIso(),
    };
    db.upsertFbmDisputeRoom(record);
    incrementCounter('fbm_matrix_dispute_room_opened_total', {});
    logEvent('marketplace.fbm_bridge.dispute_opened', { disputeId: event.disputeId, roomId });
}

export async function resolveDisputeRoom(
    event: FbmDisputeResolvedEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const existing = db.getFbmDisputeRoom(event.disputeId);
    if (!existing || existing.status === 'resolved') return; // unknown or idempotent

    const resolvedAt = event.occurredAt;
    const purgeAfter = new Date(
        Date.parse(resolvedAt) + disputeRetentionDays() * 24 * 60 * 60 * 1000
    ).toISOString();

    // Read-only: raise the bar for sending so the record can't be altered.
    await matrix.sendStateEvent(existing.roomId, 'm.room.power_levels', {
        events_default: 50,
    });
    await matrix.sendStateEvent(
        existing.roomId,
        FBM_DISPUTE_EVENT_TYPE,
        {
            ...disputeStateContent(
                event.disputeId,
                existing.vendorId,
                'resolved',
                resolvedAt,
                existing.orderId ?? undefined,
                event.outcome
            ),
        },
        event.disputeId
    );

    db.upsertFbmDisputeRoom({ ...existing, status: 'resolved', resolvedAt, purgeAfter });
    incrementCounter('fbm_matrix_dispute_room_resolved_total', {});
    logEvent('marketplace.fbm_bridge.dispute_resolved', {
        disputeId: event.disputeId,
        roomId: existing.roomId,
        purgeAfter,
    });
}
