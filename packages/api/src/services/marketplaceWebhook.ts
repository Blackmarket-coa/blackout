import type { MarketplaceProvider, NormalizedLifecycleEvent } from '@blackout/core';
import {
    applyLifecycleEvent,
    recordWebhookReceipt,
    type ApplyEventResult,
} from './marketplaceEntitlements';
import { incrementCounter, logEvent } from './marketplaceObservability';

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
