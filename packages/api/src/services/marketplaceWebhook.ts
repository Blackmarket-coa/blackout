import type { LifecycleEventType, MarketplaceProvider, NormalizedLifecycleEvent } from '@blackout/core';
import {
    applyLifecycleEvent,
    hasProcessedWebhookEvent,
    markWebhookProcessed,
    recordWebhookReceipt,
    type ApplyEventResult,
} from './marketplaceEntitlements';
import { incrementCounter, logEvent } from './marketplaceObservability';
import { captureTip, refundTip } from './tips';
import { captureSubscription, refundSubscription } from './creatorSubscriptions';

const CREATOR_EVENT_TYPES: ReadonlySet<LifecycleEventType> = new Set([
    'creator.payout.completed',
    'listing.signed_bundle.published',
    'creator.account.suspended',
]);

export interface WebhookDispatchResult {
    ok: boolean;
    status: number;
    reason?: string;
    event?: NormalizedLifecycleEvent;
    applied?: ApplyEventResult;
}

export async function dispatchMarketplaceWebhook(
    provider: MarketplaceProvider,
    rawBody: string,
    headers: Record<string, string | undefined>
): Promise<WebhookDispatchResult> {
    const verification = provider.verifyWebhook(rawBody, headers);
    if (!verification.ok) {
        if (verification.eventId) {
            recordWebhookReceipt(provider.id, verification.eventId, false, safeParse(rawBody));
        }
        incrementCounter('marketplace_webhook_rejected_total', {
            providerId: provider.id,
            reason: verification.reason ?? 'verification-failed',
        });
        logEvent('marketplace.webhook.rejected', {
            providerId: provider.id,
            eventId: verification.eventId,
            reason: verification.reason ?? 'verification-failed',
        });
        return { ok: false, status: 401, reason: verification.reason ?? 'verification-failed' };
    }

    const payload = safeParse(rawBody);
    const event = provider.parseEvent(payload);
    if (!event) {
        incrementCounter('marketplace_webhook_rejected_total', {
            providerId: provider.id,
            reason: 'invalid-event-payload',
        });
        return { ok: false, status: 400, reason: 'invalid-event-payload' };
    }

    recordWebhookReceipt(provider.id, event.eventId, true, payload);

    const monetization = dispatchMonetizationEvent(provider, event);
    if (monetization) {
        return monetization;
    }

    if (CREATOR_EVENT_TYPES.has(event.type)) {
        const alreadyProcessed = hasProcessedWebhookEvent(provider.id, event.eventId);
        if (!alreadyProcessed) markWebhookProcessed(provider.id, event.eventId);
        incrementCounter('marketplace_creator_event_total', {
            providerId: provider.id,
            type: event.type,
        });
        logEvent('marketplace.webhook.creator_event', {
            providerId: provider.id,
            eventId: event.eventId,
            eventType: event.type,
            userId: event.userId,
            providerListingId: event.providerListingId,
            alreadyProcessed,
        });
        return {
            ok: true,
            status: 200,
            event,
            applied: { entitlement: null, licenseKey: null, alreadyProcessed },
        };
    }

    const applied = applyLifecycleEvent(event);
    logEvent('marketplace.webhook.applied', {
        providerId: provider.id,
        eventId: event.eventId,
        eventType: event.type,
        userId: event.userId,
        entitlementId: applied.entitlement?.id,
        alreadyProcessed: applied.alreadyProcessed,
    });
    return { ok: true, status: 200, event, applied };
}

function safeParse(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// Routes purchase events that carry monetization-primitive metadata
// (tipId / creatorSubscriptionId) to the right service. Tips never grant
// marketplace entitlements, so we short-circuit and return early. Creator
// subs DO grant a `subscription_tier` entitlement via the standard
// pipeline, so we update the subscription row first and then let
// dispatchMarketplaceWebhook fall through to applyLifecycleEvent.
function dispatchMonetizationEvent(
    provider: MarketplaceProvider,
    event: NormalizedLifecycleEvent
): WebhookDispatchResult | null {
    const meta = event.metadata ?? {};
    const tipId = typeof meta['tipId'] === 'string' ? (meta['tipId'] as string) : null;
    const creatorSubscriptionId =
        typeof meta['creatorSubscriptionId'] === 'string'
            ? (meta['creatorSubscriptionId'] as string)
            : null;

    if (tipId) {
        const fbmOrderId = typeof meta['fbmOrderId'] === 'string' ? (meta['fbmOrderId'] as string) : null;
        if (event.type === 'purchase.succeeded') {
            captureTip(tipId, { fbmOrderId });
            incrementCounter('marketplace_tip_captured_total', { providerId: provider.id });
        } else if (event.type === 'purchase.refunded' || event.type === 'purchase.chargebacked') {
            refundTip(tipId);
            incrementCounter('marketplace_tip_refunded_total', { providerId: provider.id });
        }
        markWebhookProcessed(event.providerId, event.eventId);
        logEvent('marketplace.webhook.tip', {
            providerId: provider.id,
            eventId: event.eventId,
            eventType: event.type,
            tipId,
        });
        return {
            ok: true,
            status: 200,
            event,
            applied: { entitlement: null, licenseKey: null, alreadyProcessed: false },
        };
    }

    if (creatorSubscriptionId) {
        const fbmSubscriptionId =
            typeof meta['fbmSubscriptionId'] === 'string'
                ? (meta['fbmSubscriptionId'] as string)
                : null;
        const periodDays =
            typeof meta['periodDays'] === 'number' ? (meta['periodDays'] as number) : undefined;
        if (event.type === 'purchase.succeeded') {
            captureSubscription(creatorSubscriptionId, {
                fbmSubscriptionId,
                periodDays,
                effectiveAt: event.occurredAt,
            });
            incrementCounter('marketplace_creator_sub_captured_total', { providerId: provider.id });
        } else if (event.type === 'purchase.refunded' || event.type === 'purchase.chargebacked') {
            refundSubscription(creatorSubscriptionId);
            incrementCounter('marketplace_creator_sub_refunded_total', { providerId: provider.id });
        }
        // Don't return — let the standard pipeline grant/revoke the
        // `subscription_tier` entitlement so existing entitlement readers
        // (routes/entitlements.ts) see the active subscription.
        logEvent('marketplace.webhook.creator_sub', {
            providerId: provider.id,
            eventId: event.eventId,
            eventType: event.type,
            creatorSubscriptionId,
        });
    }

    return null;
}
