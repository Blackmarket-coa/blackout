// Feature 2 (AOG §4.2): subscription-gated rooms. When an FBM subscription tier
// activates the buyer is invited to the tier's standing room; when it lapses the
// buyer is removed. Tier → room mappings are operator-provisioned (env), so a
// missing mapping is a clean no-op rather than an error.

import { incrementCounter, logEvent } from '../marketplaceObservability';
import type { FbmBridgeMatrixClient } from './client';
import { resolveBuyerMxid } from './identity';
import type {
    FbmSubscriptionActivatedEvent,
    FbmSubscriptionLapsedEvent,
    FbmSubscriptionTier,
} from './events';

const TIER_ENV: Record<FbmSubscriptionTier, string> = {
    signal: 'FBM_TIER_ROOM_SIGNAL',
    signal_plus: 'FBM_TIER_ROOM_SIGNAL_PLUS',
    community: 'FBM_TIER_ROOM_COMMUNITY',
};

function tierRoomId(tier: FbmSubscriptionTier): string | null {
    const value = process.env[TIER_ENV[tier]];
    return value && value.trim().length > 0 ? value.trim() : null;
}

function skip(action: string, tier: string, reason: string): void {
    incrementCounter('fbm_matrix_subscription_skipped_total', { action, tier, reason });
    logEvent('marketplace.fbm_bridge.subscription_skipped', { action, tier, reason });
}

export async function applySubscriptionActivated(
    event: FbmSubscriptionActivatedEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const roomId = tierRoomId(event.tier);
    if (!roomId) return skip('activate', event.tier, 'no_tier_room');
    const mxid = resolveBuyerMxid(event.userId);
    if (!mxid) return skip('activate', event.tier, 'unresolved_buyer');

    const invited = await matrix.inviteToRoom(roomId, mxid, `FBM ${event.tier} access`);
    if (!invited.ok) {
        // Standing rooms may already contain the user, or the bot may lack invite
        // power; fall back to an admin force-join.
        const joined = await matrix.adminJoinUserToRoom(roomId, mxid);
        if (!joined.ok) {
            incrementCounter('fbm_matrix_bridge_action_failed_total', {
                feature: 'subscription_rooms',
                action: 'activate',
            });
            logEvent('marketplace.fbm_bridge.action_failed', {
                feature: 'subscription_rooms',
                action: 'activate',
                tier: event.tier,
                detail: 'detail' in joined ? joined.detail : joined.status,
            });
            return;
        }
    }
    incrementCounter('fbm_matrix_subscription_applied_total', { action: 'activate', tier: event.tier });
}

export async function applySubscriptionLapsed(
    event: FbmSubscriptionLapsedEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const roomId = tierRoomId(event.tier);
    if (!roomId) return skip('lapse', event.tier, 'no_tier_room');
    const mxid = resolveBuyerMxid(event.userId);
    if (!mxid) return skip('lapse', event.tier, 'unresolved_buyer');

    const kicked = await matrix.kickFromRoom(roomId, mxid, `FBM ${event.tier} lapsed`);
    if (!kicked.ok) {
        incrementCounter('fbm_matrix_bridge_action_failed_total', {
            feature: 'subscription_rooms',
            action: 'lapse',
        });
        logEvent('marketplace.fbm_bridge.action_failed', {
            feature: 'subscription_rooms',
            action: 'lapse',
            tier: event.tier,
            detail: 'detail' in kicked ? kicked.detail : kicked.status,
        });
        return;
    }
    incrementCounter('fbm_matrix_subscription_applied_total', { action: 'lapse', tier: event.tier });
}
