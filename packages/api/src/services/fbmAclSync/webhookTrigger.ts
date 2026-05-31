// FBM-driven trigger for the ACL sync worker. FBM emits an `entitlements.changed`
// webhook (same signed channel as the marketplace webhooks) whenever a user's
// access / governance roles / coalition membership changes; we re-sync that
// MXID's Matrix power levels promptly instead of waiting for the reconcile loop.
//
// Routed from `dispatchMarketplaceWebhook` BEFORE the bridge/lifecycle branches,
// independent of the FBM_MATRIX_BRIDGE_ENABLED gate (this is gated by
// FBM_ACL_SYNC_ENABLED). Replay-safe via the shared webhook-audit table.

import type { MarketplaceProvider } from '@blackout/core';
import {
    hasProcessedWebhookEvent,
    markWebhookProcessed,
    recordWebhookReceipt,
    type ApplyEventResult,
} from '../marketplaceEntitlements';
import { incrementCounter, logEvent } from '../marketplaceObservability';
import { aclSyncEnabled } from './config';
import { syncMxidAcls } from './index';

interface AclWebhookResult {
    ok: boolean;
    status: number;
    applied: ApplyEventResult;
}

const ack = (alreadyProcessed: boolean): AclWebhookResult => ({
    ok: true,
    status: 200,
    applied: { entitlement: null, licenseKey: null, alreadyProcessed },
});

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Returns a 200 ack for an `entitlements.changed` event (firing a best-effort
 * MXID re-sync), or `null` for any other payload so the caller falls through.
 */
export function tryHandleEntitlementsChanged(
    provider: MarketplaceProvider,
    payload: unknown
): AclWebhookResult | null {
    if (!isRecord(payload) || payload.type !== 'entitlements.changed') return null;
    const eventId = typeof payload.eventId === 'string' ? payload.eventId : null;
    const mxid = typeof payload.mxid === 'string' ? payload.mxid : null;
    if (!eventId || !mxid) return null;

    if (hasProcessedWebhookEvent(provider.id, eventId)) return ack(true);
    recordWebhookReceipt(provider.id, eventId, true, payload);

    if (aclSyncEnabled()) {
        // Fire-and-forget; the worker is best-effort and never throws.
        void syncMxidAcls(mxid);
        incrementCounter('fbm_acl_sync_triggered_total', { source: 'webhook' });
        logEvent('fbm.acl_sync.triggered', { mxid, eventId });
    } else {
        incrementCounter('fbm_acl_sync_skipped_total', { reason: 'flag_off' });
    }
    markWebhookProcessed(provider.id, eventId);
    return ack(false);
}
