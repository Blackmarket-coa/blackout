import type {
    LifecycleEventType,
    MarketplaceProvider,
    NormalizedLifecycleEvent,
} from '@blackout/core';
import {
    applyLifecycleEvent,
    hasProcessedWebhookEvent,
    markWebhookProcessed,
    recordWebhookReceipt,
    type ApplyEventResult,
} from './marketplaceEntitlements';
import { incrementCounter, logEvent } from './marketplaceObservability';
import { flushRuntimeStoreWrites } from '../db/store';
import { creatorDrivenSalesTotal, creatorDrivenGmvCentsTotal } from '../telemetry/metrics';
import { captureTip, createTip, refundTip, TipValidationError } from './tips';
import { captureSubscription, refundSubscription } from './creatorSubscriptions';
import { applySubscriptionWebhookEvent } from './subscriptions';
import { captureBoostPledge, refundBoostPledge } from './communityBoosts';
import { ambassadorService, bountyRewardService, questsService, referralService } from './growth';
import { dispatchFbmMatrixEvent, parseFbmMatrixEvent } from './fbmMatrixBridge';
import { maybeDeliverDigitalDeadDrop } from './fbmMatrixBridge/deadDropDelivery';
import { tryHandleEntitlementsChanged } from './fbmAclSync/webhookTrigger';

const GROWTH_ATTRIBUTION_EVENT_TYPES: ReadonlySet<LifecycleEventType> = new Set([
    'referral.attributed',
    'ambassador.commission_paid',
    'quest.reward_settled',
    'bounty.reward_settled',
]);

const SYSTEM_SENDER_USER_ID = 'system:freeblackmarket';

const growthAttributionWebhooksEnabled = (): boolean =>
    process.env.BLACKOUT_GROWTH_ATTRIBUTION_WEBHOOKS === 'true';

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

    // entitlements.changed → ACL sync (independent of the bridge gate). Returns
    // null for any other payload so the bridge/lifecycle branches below run.
    const aclAck = tryHandleEntitlementsChanged(provider, payload);
    if (aclAck) return aclAck;

    // FBM → Matrix bridge events (order.*, inventory.*, ledger.*, subscription.*,
    // dispute.*) are not part of the closed entitlement lifecycle enum, so they
    // are routed here BEFORE provider.parseEvent (which would reject them as
    // invalid). parseFbmMatrixEvent returns null for any non-bridge payload
    // (incl. purchase.*), leaving the entitlement path below untouched.
    const bridgeEvent = parseFbmMatrixEvent(payload);
    if (bridgeEvent) {
        recordWebhookReceipt(provider.id, bridgeEvent.eventId, true, payload);
        return dispatchFbmMatrixEvent(provider, bridgeEvent);
    }

    const event = provider.parseEvent(payload);
    if (!event) {
        incrementCounter('marketplace_webhook_rejected_total', {
            providerId: provider.id,
            reason: 'invalid-event-payload',
        });
        return { ok: false, status: 400, reason: 'invalid-event-payload' };
    }

    recordWebhookReceipt(provider.id, event.eventId, true, payload);

    if (GROWTH_ATTRIBUTION_EVENT_TYPES.has(event.type)) {
        return dispatchGrowthAttributionEvent(provider, event);
    }

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
    // Durability barrier: the entitlement grant / license issuance above is a
    // financially-significant write that the synchronous store only put in the
    // in-memory mirror. Flush it to Postgres before we ack the webhook, so a
    // crash cannot lose a paid entitlement (no-op unless BLACKOUT_DB_MODE=postgres).
    await flushRuntimeStoreWrites();
    // Best-effort digital-product dead-drop delivery (AOG §4.1). Fire-and-forget
    // so a Matrix outage can never block or fail the entitlement grant; no-ops
    // unless the bridge is enabled and the purchase is flagged digitalDelivery.
    void maybeDeliverDigitalDeadDrop(event, applied);
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
        const fbmOrderId =
            typeof meta['fbmOrderId'] === 'string' ? (meta['fbmOrderId'] as string) : null;
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

    // W1b: Canopy plan purchases (metadata.canopyPlanCode). The former direct
    // Stripe/Lago rail is retired — a settled FBM purchase IS the invoice.paid
    // signal, and refund/chargeback maps onto charge.refunded. Canopy gating
    // stays local (routes/entitlements.ts reads the canopy record), and the
    // plan listings grant no marketplace entitlement, so short-circuit.
    const canopyPlanCode =
        typeof meta['canopyPlanCode'] === 'string' ? (meta['canopyPlanCode'] as string) : null;
    if (canopyPlanCode && event.userId) {
        if (event.type === 'purchase.succeeded') {
            applySubscriptionWebhookEvent({
                eventId: event.eventId,
                type: 'invoice.paid',
                userId: event.userId,
                planCode: canopyPlanCode,
                occurredAt: event.occurredAt,
                metadata: {
                    provider: provider.id,
                    fbmOrderId: typeof meta['fbmOrderId'] === 'string' ? meta['fbmOrderId'] : null,
                },
            });
            incrementCounter('marketplace_canopy_captured_total', { providerId: provider.id });
        } else if (event.type === 'purchase.refunded' || event.type === 'purchase.chargebacked') {
            applySubscriptionWebhookEvent({
                eventId: event.eventId,
                type: 'charge.refunded',
                userId: event.userId,
                occurredAt: event.occurredAt,
                metadata: { provider: provider.id, sourceEventType: event.type },
            });
            incrementCounter('marketplace_canopy_refunded_total', { providerId: provider.id });
        }
        markWebhookProcessed(event.providerId, event.eventId);
        logEvent('marketplace.webhook.canopy', {
            providerId: provider.id,
            eventId: event.eventId,
            eventType: event.type,
            canopyPlanCode,
        });
        return {
            ok: true,
            status: 200,
            event,
            applied: { entitlement: null, licenseKey: null, alreadyProcessed: false },
        };
    }

    const boostPledgeId =
        typeof meta['boostPledgeId'] === 'string' ? (meta['boostPledgeId'] as string) : null;
    if (boostPledgeId) {
        const fbmSubscriptionId =
            typeof meta['fbmSubscriptionId'] === 'string'
                ? (meta['fbmSubscriptionId'] as string)
                : null;
        const periodDays =
            typeof meta['periodDays'] === 'number' ? (meta['periodDays'] as number) : undefined;
        if (event.type === 'purchase.succeeded') {
            captureBoostPledge(boostPledgeId, {
                fbmSubscriptionId,
                periodDays,
                effectiveAt: event.occurredAt,
            });
            incrementCounter('marketplace_boost_captured_total', { providerId: provider.id });
        } else if (event.type === 'purchase.refunded' || event.type === 'purchase.chargebacked') {
            refundBoostPledge(boostPledgeId);
            incrementCounter('marketplace_boost_refunded_total', { providerId: provider.id });
        }
        logEvent('marketplace.webhook.community_boost', {
            providerId: provider.id,
            eventId: event.eventId,
            eventType: event.type,
            boostPledgeId,
        });
        // Boost pledges don't grant marketplace entitlements (the perks
        // come from the aggregate boost level), so short-circuit.
        markWebhookProcessed(event.providerId, event.eventId);
        return {
            ok: true,
            status: 200,
            event,
            applied: { entitlement: null, licenseKey: null, alreadyProcessed: false },
        };
    }

    return null;
}

// Settles deferred growth-engine ledger entries when the marketplace
// reports an attribution-bearing checkout / renewal. Each branch:
//   1. resolves the originating ledger record from `event.metadata`,
//   2. creates + captures a tip from a system sender to the ledger
//      record's beneficiary, with the right `contextKind` + `metadata`
//      back-reference so the audit trail is bidirectional,
//   3. links the tip back onto the ledger record (where applicable;
//      ambassadors carry no per-tip column today, the metadata on the
//      tip is enough).
// Gated by BLACKOUT_GROWTH_ATTRIBUTION_WEBHOOKS — when off we still
// ack the event so FBM doesn't retry, but skip the side-effects.
// Idempotent: replays return early via hasProcessedWebhookEvent.
function dispatchGrowthAttributionEvent(
    provider: MarketplaceProvider,
    event: NormalizedLifecycleEvent
): WebhookDispatchResult {
    const alreadyProcessed = hasProcessedWebhookEvent(provider.id, event.eventId);
    if (alreadyProcessed) {
        logEvent('marketplace.webhook.growth_attribution.replay', {
            providerId: provider.id,
            eventId: event.eventId,
            eventType: event.type,
        });
        return {
            ok: true,
            status: 200,
            event,
            applied: { entitlement: null, licenseKey: null, alreadyProcessed: true },
        };
    }

    if (!growthAttributionWebhooksEnabled()) {
        markWebhookProcessed(event.providerId, event.eventId);
        incrementCounter('marketplace_growth_attribution_skipped_total', {
            providerId: provider.id,
            type: event.type,
        });
        logEvent('marketplace.webhook.growth_attribution.skipped', {
            providerId: provider.id,
            eventId: event.eventId,
            eventType: event.type,
            reason: 'flag_off',
        });
        return {
            ok: true,
            status: 200,
            event,
            applied: { entitlement: null, licenseKey: null, alreadyProcessed: false },
        };
    }

    const meta = event.metadata ?? {};
    const grossCents = typeof meta['grossCents'] === 'number' ? (meta['grossCents'] as number) : 0;
    const currency = typeof meta['currency'] === 'string' ? (meta['currency'] as string) : 'USD';
    const fbmOrderId =
        typeof meta['fbmOrderId'] === 'string' ? (meta['fbmOrderId'] as string) : null;

    if (event.type === 'referral.attributed') {
        const referralId =
            typeof meta['referralId'] === 'string' ? (meta['referralId'] as string) : null;
        if (!referralId) {
            return ackUnresolvable(provider, event, 'missing_referralId');
        }
        const referral = referralService.get(referralId);
        if (!referral) {
            return ackUnresolvable(provider, event, 'unknown_referralId');
        }
        const tip = safeCreateAndCaptureSystemTip({
            recipientUserId: referral.referrerUserId,
            contextKind: 'referral_bonus',
            contextRef: referralId,
            grossCents,
            currency,
            fbmOrderId,
            metadata: { referralId, refereeUserId: referral.refereeUserId },
            note: 'Referral reward',
        });
        if (tip) {
            referralService.markSettled(referralId, {
                rewardTipId: tip.id,
                rewardCents: tip.netCents,
                settledAt: event.occurredAt,
            });
        }
        return finalizeGrowthAttribution(provider, event, tip?.id ?? null);
    }

    if (event.type === 'ambassador.commission_paid') {
        const ambassadorId =
            typeof meta['ambassadorId'] === 'string' ? (meta['ambassadorId'] as string) : null;
        if (!ambassadorId) {
            return ackUnresolvable(provider, event, 'missing_ambassadorId');
        }
        const ambassador = ambassadorService.get(ambassadorId);
        if (!ambassador) {
            return ackUnresolvable(provider, event, 'unknown_ambassadorId');
        }
        const periodKey =
            typeof meta['periodKey'] === 'string' ? (meta['periodKey'] as string) : null;
        const tip = safeCreateAndCaptureSystemTip({
            recipientUserId: ambassador.userId,
            contextKind: 'ambassador_commission',
            contextRef: periodKey ?? ambassadorId,
            grossCents,
            currency,
            fbmOrderId,
            metadata: { ambassadorId, periodKey, tier: ambassador.tier },
            note: 'Ambassador commission',
        });
        return finalizeGrowthAttribution(provider, event, tip?.id ?? null);
    }

    if (event.type === 'quest.reward_settled') {
        const questCompletionId =
            typeof meta['questCompletionId'] === 'string'
                ? (meta['questCompletionId'] as string)
                : null;
        if (!questCompletionId) {
            return ackUnresolvable(provider, event, 'missing_questCompletionId');
        }
        // Locate the completion via its user (the user is on the lifecycle event).
        const completions = questsService.listCompletionsForUser(event.userId);
        const completion = completions.find((c) => c.id === questCompletionId);
        if (!completion) {
            return ackUnresolvable(provider, event, 'unknown_questCompletionId');
        }
        const questId =
            typeof meta['questId'] === 'string' ? (meta['questId'] as string) : completion.questId;
        const tip = safeCreateAndCaptureSystemTip({
            recipientUserId: completion.userId,
            contextKind: 'quest_reward',
            contextRef: questId,
            grossCents,
            currency,
            fbmOrderId,
            metadata: { questCompletionId, questId },
            note: 'Quest reward',
        });
        if (tip) {
            questsService.markCompletionSettled(questCompletionId, { rewardTipId: tip.id });
        }
        return finalizeGrowthAttribution(provider, event, tip?.id ?? null);
    }

    if (event.type === 'bounty.reward_settled') {
        const bountyId = typeof meta['bountyId'] === 'string' ? (meta['bountyId'] as string) : null;
        if (!bountyId) {
            return ackUnresolvable(provider, event, 'missing_bountyId');
        }
        const reward = bountyRewardService.get(bountyId);
        if (!reward) {
            return ackUnresolvable(provider, event, 'unknown_bountyId');
        }
        const tip = safeCreateAndCaptureSystemTip({
            recipientUserId: reward.beneficiaryId,
            contextKind: 'bounty_reward',
            contextRef: bountyId,
            grossCents: grossCents || reward.rewardCents || 0,
            currency,
            fbmOrderId,
            metadata: { bountyId, posterId: reward.posterId, rewardType: reward.rewardType },
            note: 'Bounty reward',
        });
        if (tip) {
            bountyRewardService.settle(bountyId, {
                ref: tip.id,
                settledAt: event.occurredAt,
            });
        }
        return finalizeGrowthAttribution(provider, event, tip?.id ?? null);
    }

    return ackUnresolvable(provider, event, 'unhandled_event_type');
}

interface SystemTipInput {
    recipientUserId: string;
    contextKind: 'referral_bonus' | 'ambassador_commission' | 'quest_reward' | 'bounty_reward';
    contextRef: string | null;
    grossCents: number;
    currency: string;
    fbmOrderId: string | null;
    metadata: Record<string, unknown>;
    note: string;
}

// Wraps create+capture so a TipValidationError (zero-amount, recipient
// not found, duplicate fbmOrderId) doesn't NACK the webhook. If the
// tip can't be created we still ack the event and log so the operator
// can repair the upstream ledger seed.
function safeCreateAndCaptureSystemTip(
    input: SystemTipInput
): { id: string; netCents: number } | null {
    try {
        const tip = createTip({
            senderUserId: SYSTEM_SENDER_USER_ID,
            recipientUserId: input.recipientUserId,
            contextKind: input.contextKind,
            contextRef: input.contextRef,
            grossCents: input.grossCents,
            currency: input.currency,
            fbmOrderId: input.fbmOrderId,
            metadata: input.metadata,
            note: input.note,
        });
        const captured = captureTip(tip.id, { fbmOrderId: input.fbmOrderId });
        return { id: tip.id, netCents: captured?.netCents ?? tip.netCents };
    } catch (err) {
        const reason = err instanceof TipValidationError ? err.code : 'unknown';
        logEvent('marketplace.webhook.growth_attribution.tip_skipped', {
            recipientUserId: input.recipientUserId,
            contextKind: input.contextKind,
            reason,
        });
        return null;
    }
}

const CREATOR_DRIVEN_KIND_BY_EVENT: Partial<Record<LifecycleEventType, string>> = {
    'referral.attributed': 'referral_bonus',
    'ambassador.commission_paid': 'ambassador_commission',
    'quest.reward_settled': 'quest_reward',
    'bounty.reward_settled': 'bounty_reward',
};

function finalizeGrowthAttribution(
    provider: MarketplaceProvider,
    event: NormalizedLifecycleEvent,
    tipId: string | null
): WebhookDispatchResult {
    markWebhookProcessed(event.providerId, event.eventId);
    incrementCounter('marketplace_growth_attribution_total', {
        providerId: provider.id,
        type: event.type,
    });
    // Record the single KPI — a creator-driven sale — only when a reward tip
    // was actually captured (tipId set). gmv is the gross cents of the sale.
    const attributionKind = tipId ? CREATOR_DRIVEN_KIND_BY_EVENT[event.type] : undefined;
    if (attributionKind) {
        const meta = event.metadata ?? {};
        const gmvCents =
            typeof meta['grossCents'] === 'number' ? (meta['grossCents'] as number) : 0;
        creatorDrivenSalesTotal.inc({ attribution_kind: attributionKind });
        creatorDrivenGmvCentsTotal.inc({ attribution_kind: attributionKind }, gmvCents);
        incrementCounter('creator_driven_sales_total', { attributionKind });
        incrementCounter('creator_driven_gmv_cents', { attributionKind }, gmvCents);
    }
    logEvent('marketplace.webhook.growth_attribution', {
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

function ackUnresolvable(
    provider: MarketplaceProvider,
    event: NormalizedLifecycleEvent,
    reason: string
): WebhookDispatchResult {
    markWebhookProcessed(event.providerId, event.eventId);
    incrementCounter('marketplace_growth_attribution_unresolved_total', {
        providerId: provider.id,
        type: event.type,
        reason,
    });
    logEvent('marketplace.webhook.growth_attribution.unresolved', {
        providerId: provider.id,
        eventId: event.eventId,
        eventType: event.type,
        reason,
    });
    return {
        ok: true,
        status: 200,
        event,
        applied: { entitlement: null, licenseKey: null, alreadyProcessed: false },
    };
}
