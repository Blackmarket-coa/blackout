// §3.1 Barter Board + §3.3 Coalition Credits / participation-XP — two later FBM
// event families surfaced through the bridge. Barter offers fan into the vendor's
// orders room (the counterparty appears by pseudonym only); order-linked credits
// /XP rewards post into the buyer's own order room. Both are best-effort: a
// Matrix failure logs + counts, never throws. Persistent balances/ledgers remain
// FBM's responsibility (Coalition Credits live in FBM's entitlements service);
// non-order participation XP (which would need a per-user wallet room) is a
// documented follow-up.

import { incrementCounter, logEvent } from '../marketplaceObservability';
import type { FbmBridgeMatrixClient } from './client';
import { buyerAliasForUserId } from './identity';
import type { FbmBarterEvent, FbmCreditsEvent } from './events';
import { formatBarter, formatCredits } from './messageFormat';
import { ensureBuyerOrderRoom, ensureVendorSpace } from './vendorRooms';

function failed(feature: string, action: string, detail?: unknown): void {
    incrementCounter('fbm_matrix_bridge_action_failed_total', { feature, action });
    logEvent('marketplace.fbm_bridge.action_failed', { feature, action, detail });
}

/** §3.1 — post a barter trade-offer into the vendor's orders room. */
export async function postBarter(
    event: FbmBarterEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const counterpartyAlias = event.counterpartyUserId
        ? buyerAliasForUserId(event.counterpartyUserId, event.vendorId)
        : undefined;
    const rooms = await ensureVendorSpace(event.vendorId, matrix, { vendorMxid: event.vendorMxid });
    if (!rooms) return;
    const sent = await matrix.sendEvent(
        rooms.ordersRoomId,
        formatBarter(event, counterpartyAlias).content
    );
    if (!sent.ok) {
        failed('barter', 'post_barter', 'reason' in sent ? sent.reason : sent.status);
        return;
    }
    incrementCounter('fbm_matrix_barter_posted_total', { kind: event.type });
}

/** §3.3 — post an order-linked credits/XP reward into the buyer's order room. */
export async function postCredits(
    event: FbmCreditsEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const buyerRoom = await ensureBuyerOrderRoom(
        event.orderId,
        event.vendorId,
        event.userId,
        matrix
    );
    if (!buyerRoom) return;
    const sent = await matrix.sendEvent(buyerRoom.roomId, formatCredits(event).content);
    if (!sent.ok) {
        failed('credits', 'post_credits', 'reason' in sent ? sent.reason : sent.status);
        return;
    }
    incrementCounter('fbm_matrix_credits_posted_total', { kind: event.type, unit: event.unit });
}
