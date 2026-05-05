import type { LifecycleEventType, MarketplaceProvider, NormalizedLifecycleEvent } from '@blackout/core';
import {
    applyLifecycleEvent,
    hasProcessedWebhookEvent,
    markWebhookProcessed,
    recordWebhookReceipt,
    type ApplyEventResult,
} from './marketplaceEntitlements';
import { incrementCounter, logEvent } from './marketplaceObservability';

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
