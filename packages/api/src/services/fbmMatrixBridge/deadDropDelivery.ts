// Feature 3 (AOG §4.1): digital-product dead-drop delivery. On purchase of a
// digital product the bridge provisions a temporary encrypted room, invites the
// buyer, and posts a `co.bmc.marketplace.deaddrop` pointer to the fulfillment
// bundle. The room is tombstoned after 72h (or on download) by the sweeper.
//
// E2EE boundary: the bot never handles plaintext. The dead-drop appservice only
// stores client-sealed opaque envelopes (`ek`/`nonce`/`ct`), which require the
// recipient's public key — so the *seal* happens client-side. The bridge's job
// is the secure channel: a short-lived encrypted room that disappears. This
// matches the §4.1 principle that the delivery method is the security model,
// without the server ever decrypting (or fabricating) the payload.

import { randomUUID } from 'node:crypto';
import type { NormalizedLifecycleEvent } from '@blackout/core';
import {
    FBM_DEADDROP_POINTER_EVENT_TYPE,
    FBM_MARKETPLACE_SCHEMA_VERSION,
} from '@blackout/protocol';
import { db } from '../../db/store';
import type { FbmDeaddropDeliveryRecord } from '../../db/types';
import { incrementCounter, logEvent } from '../marketplaceObservability';
import type { ApplyEventResult } from '../marketplaceEntitlements';
import { bridgeEnabled, ttlHours } from './config';
import type { FbmBridgeMatrixClient } from './client';
import { defaultMatrixClient } from './client';
import { resolveBuyerMxid } from './identity';

const DIGITAL_KINDS: ReadonlySet<string> = new Set([
    'asset_bundle',
    'vault_item',
    'software_license',
]);

const nowIso = (): string => new Date().toISOString();

function isDigitalDelivery(event: NormalizedLifecycleEvent): boolean {
    if (event.type !== 'purchase.succeeded') return false;
    if (event.metadata?.['digitalDelivery'] !== true) return false;
    return DIGITAL_KINDS.has(event.kind);
}

/**
 * Best-effort, fire-and-forget delivery hung off a successful purchase. Never
 * throws and never blocks the entitlement grant. No-ops unless the bridge is
 * enabled and the purchase is flagged as a digital delivery.
 */
export async function maybeDeliverDigitalDeadDrop(
    event: NormalizedLifecycleEvent,
    applied: ApplyEventResult,
    deps: { matrixClient?: FbmBridgeMatrixClient } = {}
): Promise<void> {
    if (!bridgeEnabled() || !isDigitalDelivery(event)) return;
    const matrix = deps.matrixClient ?? defaultMatrixClient;

    try {
        // DB-level replay idempotency: a re-delivered webhook never re-provisions.
        if (db.getFbmDeaddropDeliveryBySourceEvent(event.eventId)) return;

        // Encryption + restricted history are set in `initial_state`. They used
        // to be follow-up state events, which left a plaintext window and, since
        // the results were unchecked, could leave the room permanently
        // unencrypted while the delivery pointer was still posted into it.
        const room = await matrix.createRoom({
            name: 'Your delivery',
            topic: `FBM dead-drop ${event.providerListingId}`,
            visibility: 'private',
            preset: 'private_chat',
            encrypted: true,
            initialState: [
                {
                    type: 'm.room.history_visibility',
                    state_key: '',
                    content: { history_visibility: 'joined' },
                },
            ],
        });
        if (!room.ok || !('roomId' in room) || !room.roomId) {
            incrementCounter('fbm_matrix_bridge_action_failed_total', {
                feature: 'deaddrop',
                action: 'create_room',
            });
            return;
        }
        const roomId = room.roomId;

        const expiresAt = new Date(Date.now() + ttlHours() * 60 * 60 * 1000).toISOString();

        // Pointer event: tells the buyer's client which entitlement to fetch and
        // seal via the existing fulfillment endpoint. No plaintext is posted.
        await matrix.sendEvent(roomId, {
            msgtype: 'm.notice',
            body: 'Your purchase is ready. Open it in Blackout before it expires.',
            [FBM_DEADDROP_POINTER_EVENT_TYPE]: {
                schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
                entitlementId: applied.entitlement?.id ?? null,
                providerListingId: event.providerListingId,
                kind: event.kind,
                expiresAt,
            },
        });

        const buyerMxid = resolveBuyerMxid(event.userId);
        if (buyerMxid) {
            const invited = await matrix.inviteToRoom(roomId, buyerMxid, 'Your FBM delivery');
            if (!invited.ok) await matrix.adminJoinUserToRoom(roomId, buyerMxid);
        }

        const record: FbmDeaddropDeliveryRecord = {
            id: randomUUID(),
            sourceEventId: event.eventId,
            buyerUserId: event.userId,
            entitlementId: applied.entitlement?.id ?? null,
            roomId,
            dropId: null,
            clue: null,
            expiresAt,
            downloadedAt: null,
            tombstonedAt: null,
            createdAt: nowIso(),
        };
        db.upsertFbmDeaddropDelivery(record);
        incrementCounter('fbm_matrix_deaddrop_delivered_total', {});
        logEvent('marketplace.fbm_bridge.deaddrop_delivered', {
            eventId: event.eventId,
            roomId,
            entitlementId: record.entitlementId,
        });
    } catch (err) {
        incrementCounter('fbm_matrix_bridge_action_failed_total', {
            feature: 'deaddrop',
            action: 'deliver',
        });
        logEvent('marketplace.fbm_bridge.action_failed', {
            feature: 'deaddrop',
            action: 'deliver',
            detail: err instanceof Error ? err.message : String(err),
        });
    }
}
