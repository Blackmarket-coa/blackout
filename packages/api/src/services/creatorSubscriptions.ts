import crypto from 'node:crypto';
import { computePlatformCommission, type MarketplaceProviderId } from '@blackout/core';
import { db } from '../db/store';
import type {
    CreatorSubscriptionRecord,
    CreatorSubscriptionStatus,
    CreatorSubscriptionTierRecord,
    CreatorSubscriptionTierStatus,
    MarketplaceProviderIdString,
} from '../db/types';
import { getMarketplaceProvider } from '../integrations/marketplace';
import { emitDomainEvent } from '../modules/domain-events';
import { incrementCounter, logEvent } from './marketplaceObservability';

const DEFAULT_PROVIDER: MarketplaceProviderId = 'freeblackmarket';
const MIN_TIER_PRICE_CENTS = 199; // matches the SQL CHECK and FBM's subscription floor.
const MAX_TIER_PRICE_CENTS = 100_000;
const DEFAULT_PERIOD_DAYS = 30;

export class CreatorSubscriptionError extends Error {
    constructor(
        public readonly code:
            | 'self_subscribe_forbidden'
            | 'creator_unknown'
            | 'tier_not_found'
            | 'tier_archived'
            | 'tier_price_out_of_range'
            | 'invalid_currency'
            | 'tier_name_required'
            | 'already_active'
            | 'subscription_not_found'
            | 'provider_unsupported',
        message: string
    ) {
        super(message);
        this.name = 'CreatorSubscriptionError';
    }
}

export interface TierView {
    id: string;
    creatorUserId: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    providerId: MarketplaceProviderId;
    fbmListingId: string | null;
    status: CreatorSubscriptionTierStatus;
    feeCents: number;
    netCents: number;
    createdAt: string;
    updatedAt: string;
}

export interface SubscriptionView {
    id: string;
    subscriberUserId: string;
    creatorUserId: string;
    tierId: string;
    providerId: MarketplaceProviderId;
    fbmSubscriptionId: string | null;
    status: CreatorSubscriptionStatus;
    startedAt: string | null;
    currentPeriodEndsAt: string | null;
    canceledAt: string | null;
    createdAt: string;
    updatedAt: string;
}

function nowIso(): string {
    return new Date().toISOString();
}

function periodEnd(fromIso: string, days = DEFAULT_PERIOD_DAYS): string {
    return new Date(new Date(fromIso).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function toTierView(record: CreatorSubscriptionTierRecord): TierView {
    const split = computePlatformCommission(
        record.priceCents,
        record.providerId as MarketplaceProviderId
    );
    return {
        id: record.id,
        creatorUserId: record.creatorUserId,
        name: record.name,
        description: record.description,
        priceCents: record.priceCents,
        currency: record.currency,
        providerId: record.providerId as MarketplaceProviderId,
        fbmListingId: record.fbmListingId,
        status: record.status,
        feeCents: split.feeCents,
        netCents: split.netCents,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

function toSubscriptionView(record: CreatorSubscriptionRecord): SubscriptionView {
    return {
        id: record.id,
        subscriberUserId: record.subscriberUserId,
        creatorUserId: record.creatorUserId,
        tierId: record.tierId,
        providerId: record.providerId as MarketplaceProviderId,
        fbmSubscriptionId: record.fbmSubscriptionId,
        status: record.status,
        startedAt: record.startedAt,
        currentPeriodEndsAt: record.currentPeriodEndsAt,
        canceledAt: record.canceledAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

export interface CreateTierInput {
    creatorUserId: string;
    name: string;
    description?: string | null;
    priceCents: number;
    currency: string;
    providerId?: MarketplaceProviderId;
}

// Records the tier locally in `draft` and registers a matching
// subscription-category listing on FBM via `createCreatorListing`. If the
// upstream call fails the tier is still saved as `draft` so the creator
// can retry; once FBM acks the listing id, status flips to `active`.
export async function createTier(input: CreateTierInput): Promise<TierView> {
    if (!input.name || input.name.trim().length === 0) {
        throw new CreatorSubscriptionError('tier_name_required', 'name is required');
    }
    if (
        !Number.isInteger(input.priceCents) ||
        input.priceCents < MIN_TIER_PRICE_CENTS ||
        input.priceCents > MAX_TIER_PRICE_CENTS
    ) {
        throw new CreatorSubscriptionError(
            'tier_price_out_of_range',
            `priceCents must be between ${MIN_TIER_PRICE_CENTS} and ${MAX_TIER_PRICE_CENTS}`
        );
    }
    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3,8}$/.test(currency)) {
        throw new CreatorSubscriptionError('invalid_currency', 'currency must be a 3–8 letter code');
    }
    if (!db.getUserById(input.creatorUserId)) {
        throw new CreatorSubscriptionError('creator_unknown', 'creator user does not exist');
    }

    const providerId = (input.providerId ?? DEFAULT_PROVIDER) as MarketplaceProviderIdString;
    const tierId = crypto.randomUUID();
    const ts = nowIso();
    let fbmListingId: string | null = null;
    let initialStatus: CreatorSubscriptionTierStatus = 'draft';

    const provider = getMarketplaceProvider(providerId as MarketplaceProviderId);
    if (provider?.enabled && provider.createCreatorListing) {
        try {
            const result = await provider.createCreatorListing({
                sellerUserId: input.creatorUserId,
                artifactKind: 'manifest_plugin',
                category: 'subscription',
                entitlementKind: 'subscription_tier',
                title: input.name,
                description: input.description ?? input.name,
                priceCents: input.priceCents,
                currency,
            });
            fbmListingId = result.providerListingId;
            initialStatus = result.status === 'archived' ? 'archived' : 'active';
        } catch (error) {
            logEvent('creator_sub.tier.upstream_failed', {
                providerId,
                creatorUserId: input.creatorUserId,
                error: error instanceof Error ? error.message : String(error),
            });
            incrementCounter('creator_sub_tier_upstream_failed_total', { providerId });
            // Fall through with status='draft'; caller can retry by re-issuing.
        }
    }

    const record: CreatorSubscriptionTierRecord = {
        id: tierId,
        creatorUserId: input.creatorUserId,
        name: input.name.trim(),
        description: input.description ?? null,
        priceCents: input.priceCents,
        currency,
        providerId,
        fbmListingId,
        status: initialStatus,
        createdAt: ts,
        updatedAt: ts,
    };
    db.insertCreatorSubscriptionTier(record);
    incrementCounter('creator_sub_tier_created_total', { providerId, status: initialStatus });
    logEvent('creator_sub.tier.created', {
        tierId,
        creatorUserId: input.creatorUserId,
        priceCents: input.priceCents,
        currency,
        status: initialStatus,
        fbmListingId,
    });
    return toTierView(record);
}

export function archiveTier(tierId: string, creatorUserId: string): TierView | undefined {
    const existing = db.getCreatorSubscriptionTier(tierId);
    if (!existing || existing.creatorUserId !== creatorUserId) return undefined;
    if (existing.status === 'archived') return toTierView(existing);
    const updated: CreatorSubscriptionTierRecord = {
        ...existing,
        status: 'archived',
        updatedAt: nowIso(),
    };
    db.updateCreatorSubscriptionTier(updated);
    logEvent('creator_sub.tier.archived', { tierId, creatorUserId });
    return toTierView(updated);
}

export function listTiersForCreator(creatorUserId: string): TierView[] {
    return db
        .listCreatorSubscriptionTiersForCreator(creatorUserId)
        .map(toTierView);
}

export function getTier(tierId: string): TierView | undefined {
    const record = db.getCreatorSubscriptionTier(tierId);
    return record ? toTierView(record) : undefined;
}

export interface SubscribeInput {
    subscriberUserId: string;
    tierId: string;
}

// Records a pending subscription. The actual checkout session is the
// caller's job — this is the entry point that webhook captures resolve
// against. If the subscriber already has an active subscription to this
// creator, throw `already_active` so the UI can route to billing portal.
export function startSubscription(input: SubscribeInput): SubscriptionView {
    const tier = db.getCreatorSubscriptionTier(input.tierId);
    if (!tier) {
        throw new CreatorSubscriptionError('tier_not_found', 'tier does not exist');
    }
    if (tier.status === 'archived') {
        throw new CreatorSubscriptionError('tier_archived', 'tier is no longer accepting subscribers');
    }
    if (tier.creatorUserId === input.subscriberUserId) {
        throw new CreatorSubscriptionError(
            'self_subscribe_forbidden',
            'You cannot subscribe to yourself'
        );
    }
    if (db.findActiveCreatorSubscription(input.subscriberUserId, tier.creatorUserId)) {
        throw new CreatorSubscriptionError(
            'already_active',
            'You already have an active subscription to this creator'
        );
    }

    const ts = nowIso();
    const record: CreatorSubscriptionRecord = {
        id: crypto.randomUUID(),
        subscriberUserId: input.subscriberUserId,
        creatorUserId: tier.creatorUserId,
        tierId: tier.id,
        providerId: tier.providerId,
        fbmSubscriptionId: null,
        status: 'pending',
        startedAt: null,
        currentPeriodEndsAt: null,
        canceledAt: null,
        createdAt: ts,
        updatedAt: ts,
    };
    db.insertCreatorSubscription(record);
    incrementCounter('creator_sub_subscription_created_total', { providerId: tier.providerId });
    logEvent('creator_sub.subscription.created', {
        subscriptionId: record.id,
        subscriberUserId: record.subscriberUserId,
        creatorUserId: record.creatorUserId,
        tierId: tier.id,
    });
    return toSubscriptionView(record);
}

// Webhook hook: marks a pending subscription active or extends an active
// one's period (renewal). Idempotent for repeated capture of the same
// period — it will only extend `currentPeriodEndsAt` if it isn't already
// in the future relative to `effectiveAt`.
export function captureSubscription(
    subscriptionId: string,
    detail: { fbmSubscriptionId?: string | null; periodDays?: number; effectiveAt?: string } = {}
): SubscriptionView | undefined {
    const existing = db.getCreatorSubscription(subscriptionId);
    if (!existing) return undefined;
    if (existing.status === 'refunded' || existing.status === 'expired') {
        logEvent('creator_sub.capture.rejected', { subscriptionId, status: existing.status });
        return toSubscriptionView(existing);
    }
    const effectiveAt = detail.effectiveAt ?? nowIso();
    const days = detail.periodDays ?? DEFAULT_PERIOD_DAYS;
    const newPeriodEnd = periodEnd(effectiveAt, days);
    const becameActive = existing.status !== 'active';

    const updated: CreatorSubscriptionRecord = {
        ...existing,
        status: 'active',
        startedAt: existing.startedAt ?? effectiveAt,
        currentPeriodEndsAt:
            existing.currentPeriodEndsAt && existing.currentPeriodEndsAt > newPeriodEnd
                ? existing.currentPeriodEndsAt
                : newPeriodEnd,
        fbmSubscriptionId: detail.fbmSubscriptionId ?? existing.fbmSubscriptionId,
        canceledAt: null,
        updatedAt: nowIso(),
    };
    db.updateCreatorSubscription(updated);
    incrementCounter('creator_sub_subscription_captured_total', {
        providerId: updated.providerId,
        renewal: becameActive ? 'no' : 'yes',
    });
    emitDomainEvent({
        module: 'monetization',
        type: becameActive ? 'creator_sub.activated' : 'creator_sub.renewed',
        payload: {
            subscriptionId: updated.id,
            subscriberUserId: updated.subscriberUserId,
            creatorUserId: updated.creatorUserId,
            tierId: updated.tierId,
            currentPeriodEndsAt: updated.currentPeriodEndsAt,
        },
    });
    return toSubscriptionView(updated);
}

export function cancelSubscription(
    subscriptionId: string,
    actorUserId: string
): SubscriptionView | undefined {
    const existing = db.getCreatorSubscription(subscriptionId);
    if (!existing) return undefined;
    if (existing.subscriberUserId !== actorUserId) return undefined;
    if (existing.status === 'canceled' || existing.status === 'refunded' || existing.status === 'expired') {
        return toSubscriptionView(existing);
    }
    const updated: CreatorSubscriptionRecord = {
        ...existing,
        status: 'canceled',
        canceledAt: nowIso(),
        updatedAt: nowIso(),
    };
    db.updateCreatorSubscription(updated);
    emitDomainEvent({
        module: 'monetization',
        type: 'creator_sub.canceled',
        payload: {
            subscriptionId: updated.id,
            subscriberUserId: updated.subscriberUserId,
            creatorUserId: updated.creatorUserId,
        },
    });
    return toSubscriptionView(updated);
}

export function refundSubscription(subscriptionId: string): SubscriptionView | undefined {
    const existing = db.getCreatorSubscription(subscriptionId);
    if (!existing) return undefined;
    if (existing.status === 'refunded') return toSubscriptionView(existing);
    const updated: CreatorSubscriptionRecord = {
        ...existing,
        status: 'refunded',
        canceledAt: existing.canceledAt ?? nowIso(),
        updatedAt: nowIso(),
    };
    db.updateCreatorSubscription(updated);
    emitDomainEvent({
        module: 'monetization',
        type: 'creator_sub.refunded',
        payload: {
            subscriptionId: updated.id,
            creatorUserId: updated.creatorUserId,
            subscriberUserId: updated.subscriberUserId,
        },
    });
    return toSubscriptionView(updated);
}

// Public helper consumed by the streaming module's `member_only` gate
// and by any future creator-only content surface (paywalled posts, etc.).
// "Active" means status='active' AND currentPeriodEndsAt is in the future.
export function hasActiveCreatorSubscription(
    subscriberUserId: string,
    creatorUserId: string,
    nowMillis: number = Date.now()
): boolean {
    const sub = db.findActiveCreatorSubscription(subscriberUserId, creatorUserId);
    if (!sub) return false;
    if (!sub.currentPeriodEndsAt) return false;
    return new Date(sub.currentPeriodEndsAt).getTime() > nowMillis;
}

export function listSubscriptionsForSubscriber(subscriberUserId: string): SubscriptionView[] {
    return db
        .listCreatorSubscriptionsForSubscriber(subscriberUserId)
        .map(toSubscriptionView);
}

export function listSubscribersForCreator(creatorUserId: string): SubscriptionView[] {
    return db
        .listCreatorSubscriptionsForCreator(creatorUserId)
        .map(toSubscriptionView);
}

export function getSubscription(subscriptionId: string): SubscriptionView | undefined {
    const record = db.getCreatorSubscription(subscriptionId);
    return record ? toSubscriptionView(record) : undefined;
}

export function resetCreatorSubscriptionsForTest(): void {
    db.resetCreatorSubscriptionsForTest();
}

export const CREATOR_SUB_LIMITS = {
    minTierPriceCents: MIN_TIER_PRICE_CENTS,
    maxTierPriceCents: MAX_TIER_PRICE_CENTS,
    defaultPeriodDays: DEFAULT_PERIOD_DAYS,
} as const;
