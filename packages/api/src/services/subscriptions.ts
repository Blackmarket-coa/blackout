import crypto from 'node:crypto';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type BillingInterval = 'monthly' | 'annual';
export type CanopyTier = 'free' | 'sprout' | 'canopy_pro';

type CheckoutProvider = 'stripe' | 'lago';

type SubscriptionRecord = {
  userId: string;
  customerId: string;
  stripeCustomerId: string;
  lagoCustomerExternalId: string;
  planCode: string;
  tier: CanopyTier;
  interval: BillingInterval;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  canceledAt: string | null;
  comped: boolean;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

type SubscriptionAuditEvent = {
  id: string;
  userId: string;
  type: string;
  actor: string;
  detail: Record<string, unknown>;
  occurredAt: string;
};

export type SubscriptionSnapshot = SubscriptionRecord & {
  entitlementActive: boolean;
};

export type GiftStatus = 'pending' | 'claimed' | 'forwarded' | 'expired';

export type SubscriptionGift = {
  id: string;
  donorUserId: string;
  donorPlanCode: string;
  donorTier: Exclude<CanopyTier, 'free'>;
  status: GiftStatus;
  claimedByUserId: string | null;
  claimedAt: string | null;
  forwardedToGiftId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  rootGiftId: string;
  chainDepth: number;
  metadata: Record<string, unknown>;
};

const CANOPY_PRODUCTS = [
  { planCode: 'canopy_sprout_monthly', tier: 'sprout', interval: 'monthly', trialDays: 14, graceDays: 7 },
  { planCode: 'canopy_sprout_annual', tier: 'sprout', interval: 'annual', trialDays: 14, graceDays: 10 },
  { planCode: 'canopy_pro_monthly', tier: 'canopy_pro', interval: 'monthly', trialDays: 14, graceDays: 7 },
  { planCode: 'canopy_pro_annual', tier: 'canopy_pro', interval: 'annual', trialDays: 30, graceDays: 10 },
] as const satisfies ReadonlyArray<{
  planCode: string;
  tier: Exclude<CanopyTier, 'free'>;
  interval: BillingInterval;
  trialDays: number;
  graceDays: number;
}>;

const productsByPlan = new Map(CANOPY_PRODUCTS.map((p) => [p.planCode, p]));

const subscriptions = new Map<string, SubscriptionRecord>();
const auditTimelineByUser = new Map<string, SubscriptionAuditEvent[]>();
const processedWebhookEvents = new Set<string>();
const subscriptionGifts = new Map<string, SubscriptionGift>();

const DEFAULT_GIFT_EXPIRY_DAYS = 30;

function nowIso(): string {
  return new Date().toISOString();
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function addAudit(userId: string, type: string, actor: string, detail: Record<string, unknown>) {
  const event: SubscriptionAuditEvent = {
    id: crypto.randomUUID(),
    userId,
    type,
    actor,
    detail,
    occurredAt: nowIso(),
  };
  const list = auditTimelineByUser.get(userId) ?? [];
  list.push(event);
  auditTimelineByUser.set(userId, list);
}

function entitlementActiveFor(record: SubscriptionRecord): boolean {
  if (record.status === 'active' || record.status === 'trialing') return true;
  if (record.status === 'past_due' && record.gracePeriodEndsAt) {
    return Date.parse(record.gracePeriodEndsAt) > Date.now();
  }
  return false;
}

export function listCanopyProducts() {
  return CANOPY_PRODUCTS;
}

export function getSubscription(userId: string): SubscriptionSnapshot {
  const existing = subscriptions.get(userId);
  if (existing) {
    return { ...existing, entitlementActive: entitlementActiveFor(existing) };
  }

  const free: SubscriptionRecord = {
    userId,
    customerId: `cust_${userId}`,
    stripeCustomerId: `cus_${userId}`,
    lagoCustomerExternalId: userId,
    planCode: 'free',
    tier: 'free',
    interval: 'monthly',
    status: 'canceled',
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    gracePeriodEndsAt: null,
    canceledAt: nowIso(),
    comped: false,
    metadata: {},
    updatedAt: nowIso(),
  };
  return { ...free, entitlementActive: false };
}

export function createCheckoutSession(input: {
  userId: string;
  planCode: string;
  successUrl?: string;
  cancelUrl?: string;
  provider?: CheckoutProvider;
}) {
  const product = productsByPlan.get(input.planCode);
  if (!product) throw new Error('unknown plan');

  const base = process.env.STRIPE_CHECKOUT_URL ?? 'https://checkout.stripe.com/pay/mock-session';
  const sessionId = `cs_test_${crypto.randomUUID().replace(/-/g, '')}`;
  const redirect = new URL(base);
  redirect.searchParams.set('session_id', sessionId);
  redirect.searchParams.set('plan', product.planCode);
  redirect.searchParams.set('interval', product.interval);
  if (input.successUrl) redirect.searchParams.set('success_url', input.successUrl);
  if (input.cancelUrl) redirect.searchParams.set('cancel_url', input.cancelUrl);

  addAudit(input.userId, 'checkout.session_created', 'system', {
    planCode: product.planCode,
    provider: input.provider ?? 'stripe',
    sessionId,
  });

  return {
    sessionId,
    redirectUrl: redirect.toString(),
    lago: {
      customerExternalId: input.userId,
      planCode: product.planCode,
      interval: product.interval,
      trialDays: product.trialDays,
      graceDays: product.graceDays,
    },
  };
}

export function createCustomerPortalSession(userId: string, returnUrl?: string) {
  const base = process.env.STRIPE_CUSTOMER_PORTAL_URL ?? 'https://billing.stripe.com/p/session/mock-portal';
  const url = new URL(base);
  url.searchParams.set('customer', getSubscription(userId).stripeCustomerId);
  if (returnUrl) url.searchParams.set('return_url', returnUrl);

  addAudit(userId, 'customer_portal.session_created', 'system', {
    returnUrl: returnUrl ?? null,
  });

  return { redirectUrl: url.toString() };
}

function ensureUserRecord(userId: string): SubscriptionRecord {
  const existing = subscriptions.get(userId);
  if (existing) return existing;
  const seed: SubscriptionRecord = {
    userId,
    customerId: `cust_${userId}`,
    stripeCustomerId: `cus_${userId}`,
    lagoCustomerExternalId: userId,
    planCode: 'free',
    tier: 'free',
    interval: 'monthly',
    status: 'canceled',
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    gracePeriodEndsAt: null,
    canceledAt: nowIso(),
    comped: false,
    metadata: {},
    updatedAt: nowIso(),
  };
  subscriptions.set(userId, seed);
  return seed;
}

export type SubscriptionWebhookEvent = {
  eventId: string;
  type:
    | 'invoice.paid'
    | 'invoice.payment_failed'
    | 'subscription.renewed'
    | 'subscription.canceled'
    | 'charge.refunded'
    | 'charge.dispute.created';
  userId: string;
  planCode?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

export function applySubscriptionWebhookEvent(event: SubscriptionWebhookEvent): {
  processed: boolean;
  status: SubscriptionStatus;
  userId: string;
} {
  if (processedWebhookEvents.has(event.eventId)) {
    const snapshot = getSubscription(event.userId);
    return { processed: false, status: snapshot.status, userId: event.userId };
  }

  const current = ensureUserRecord(event.userId);
  let next: SubscriptionRecord = { ...current };
  const occurredAt = event.occurredAt ?? nowIso();

  if (event.type === 'invoice.paid') {
    const product = event.planCode ? productsByPlan.get(event.planCode) : undefined;
    next = {
      ...next,
      status: 'active',
      planCode: product?.planCode ?? next.planCode,
      tier: product?.tier ?? next.tier,
      interval: product?.interval ?? next.interval,
      trialEndsAt: null,
      currentPeriodEndsAt: product?.interval === 'annual' ? daysFromNow(365) : daysFromNow(31),
      gracePeriodEndsAt: null,
      canceledAt: null,
      metadata: { ...next.metadata, ...(event.metadata ?? {}) },
      updatedAt: occurredAt,
    };
  }

  if (event.type === 'invoice.payment_failed') {
    const product = productsByPlan.get(next.planCode);
    next = {
      ...next,
      status: 'past_due',
      gracePeriodEndsAt: daysFromNow(product?.graceDays ?? 7),
      updatedAt: occurredAt,
    };
  }

  if (event.type === 'subscription.renewed') {
    next = {
      ...next,
      status: 'active',
      gracePeriodEndsAt: null,
      currentPeriodEndsAt: next.interval === 'annual' ? daysFromNow(365) : daysFromNow(31),
      updatedAt: occurredAt,
    };
  }

  if (event.type === 'subscription.canceled') {
    next = {
      ...next,
      status: 'canceled',
      canceledAt: occurredAt,
      gracePeriodEndsAt: null,
      updatedAt: occurredAt,
    };
  }

  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    next = {
      ...next,
      status: 'canceled',
      canceledAt: occurredAt,
      comped: false,
      gracePeriodEndsAt: null,
      metadata: {
        ...next.metadata,
        latestFinancialEvent: event.type,
      },
      updatedAt: occurredAt,
    };
  }

  subscriptions.set(event.userId, next);
  processedWebhookEvents.add(event.eventId);
  addAudit(event.userId, `webhook.${event.type}`, 'webhook', {
    planCode: event.planCode ?? null,
    metadata: event.metadata ?? {},
  });

  return { processed: true, status: next.status, userId: event.userId };
}

export function applyManualComp(userId: string, actor: string, detail?: string): SubscriptionSnapshot {
  const existing = ensureUserRecord(userId);
  const updated: SubscriptionRecord = {
    ...existing,
    planCode: existing.planCode === 'free' ? 'canopy_sprout_monthly' : existing.planCode,
    tier: existing.tier === 'free' ? 'sprout' : existing.tier,
    status: 'active',
    comped: true,
    gracePeriodEndsAt: null,
    canceledAt: null,
    currentPeriodEndsAt: daysFromNow(31),
    updatedAt: nowIso(),
  };
  subscriptions.set(userId, updated);
  addAudit(userId, 'admin.manual_comp', actor, { detail: detail ?? null });
  return { ...updated, entitlementActive: true };
}

export function syncRefund(userId: string, actor: string, reason?: string): SubscriptionSnapshot {
  const existing = ensureUserRecord(userId);
  const updated: SubscriptionRecord = {
    ...existing,
    status: 'canceled',
    comped: false,
    canceledAt: nowIso(),
    gracePeriodEndsAt: null,
    updatedAt: nowIso(),
    metadata: {
      ...existing.metadata,
      latestFinancialEvent: 'charge.refunded',
      refundReason: reason ?? null,
    },
  };
  subscriptions.set(userId, updated);
  addAudit(userId, 'admin.refund_sync', actor, { reason: reason ?? null });
  return { ...updated, entitlementActive: false };
}

export function getSubscriptionAuditTimeline(userId: string): SubscriptionAuditEvent[] {
  return [...(auditTimelineByUser.get(userId) ?? [])].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export function hasPremiumCanopyEntitlement(userId: string): boolean {
  return getSubscription(userId).entitlementActive;
}

function expireStaleGifts(): void {
  const now = Date.now();
  for (const [id, gift] of subscriptionGifts) {
    if (gift.status === 'pending' && Date.parse(gift.expiresAt) <= now) {
      subscriptionGifts.set(id, { ...gift, status: 'expired', updatedAt: nowIso() });
    }
  }
}

export type DonateForwardOptions = {
  expiresInDays?: number;
  metadata?: Record<string, unknown>;
};

export function donateForward(userId: string, actor: string, opts?: DonateForwardOptions): SubscriptionGift {
  const sub = getSubscription(userId);
  if (!sub.entitlementActive) {
    throw new Error('no_active_subscription');
  }
  if (sub.tier === 'free') {
    throw new Error('free_tier_cannot_donate');
  }

  const id = `gift_${crypto.randomUUID()}`;
  const gift: SubscriptionGift = {
    id,
    donorUserId: userId,
    donorPlanCode: sub.planCode,
    donorTier: sub.tier as Exclude<CanopyTier, 'free'>,
    status: 'pending',
    claimedByUserId: null,
    claimedAt: null,
    forwardedToGiftId: null,
    expiresAt: daysFromNow(opts?.expiresInDays ?? DEFAULT_GIFT_EXPIRY_DAYS),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    rootGiftId: id,
    chainDepth: 0,
    metadata: opts?.metadata ?? {},
  };
  subscriptionGifts.set(id, gift);
  addAudit(userId, 'gift.donated', actor, {
    giftId: id,
    rootGiftId: id,
    chainDepth: 0,
    tier: gift.donorTier,
  });
  return gift;
}

export function listAvailableGifts(opts?: { limit?: number }): SubscriptionGift[] {
  expireStaleGifts();
  const limit = opts?.limit ?? 50;
  const list: SubscriptionGift[] = [];
  for (const gift of subscriptionGifts.values()) {
    if (gift.status === 'pending') list.push(gift);
  }
  list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return list.slice(0, limit);
}

export function getGift(giftId: string): SubscriptionGift | undefined {
  return subscriptionGifts.get(giftId);
}

export function claimGift(
  giftId: string,
  userId: string,
  actor: string,
): { gift: SubscriptionGift; subscription: SubscriptionSnapshot } {
  const gift = subscriptionGifts.get(giftId);
  if (!gift) throw new Error('gift_not_found');
  if (gift.status !== 'pending') throw new Error('gift_unavailable');
  if (Date.parse(gift.expiresAt) <= Date.now()) {
    subscriptionGifts.set(gift.id, { ...gift, status: 'expired', updatedAt: nowIso() });
    throw new Error('gift_expired');
  }
  if (gift.donorUserId === userId) throw new Error('cannot_claim_own_gift');

  const updated: SubscriptionGift = {
    ...gift,
    status: 'claimed',
    claimedByUserId: userId,
    claimedAt: nowIso(),
    updatedAt: nowIso(),
  };
  subscriptionGifts.set(gift.id, updated);

  const subscription = applyManualComp(userId, actor, `pay_forward:${gift.id}`);
  addAudit(userId, 'gift.claimed', actor, {
    giftId: gift.id,
    rootGiftId: gift.rootGiftId,
    chainDepth: gift.chainDepth,
    donorUserId: gift.donorUserId,
  });
  return { gift: updated, subscription };
}

export function forwardGift(
  giftId: string,
  recipientUserId: string,
  actor: string,
  opts?: DonateForwardOptions,
): { previous: SubscriptionGift; next: SubscriptionGift } {
  const gift = subscriptionGifts.get(giftId);
  if (!gift) throw new Error('gift_not_found');
  if (gift.status !== 'pending') throw new Error('gift_unavailable');
  if (Date.parse(gift.expiresAt) <= Date.now()) {
    subscriptionGifts.set(gift.id, { ...gift, status: 'expired', updatedAt: nowIso() });
    throw new Error('gift_expired');
  }
  if (gift.donorUserId === recipientUserId) throw new Error('cannot_forward_own_gift');

  const nextId = `gift_${crypto.randomUUID()}`;
  const next: SubscriptionGift = {
    id: nextId,
    donorUserId: recipientUserId,
    donorPlanCode: gift.donorPlanCode,
    donorTier: gift.donorTier,
    status: 'pending',
    claimedByUserId: null,
    claimedAt: null,
    forwardedToGiftId: null,
    expiresAt: daysFromNow(opts?.expiresInDays ?? DEFAULT_GIFT_EXPIRY_DAYS),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    rootGiftId: gift.rootGiftId,
    chainDepth: gift.chainDepth + 1,
    metadata: { ...(opts?.metadata ?? {}), previousGiftId: gift.id },
  };
  subscriptionGifts.set(nextId, next);

  const previous: SubscriptionGift = {
    ...gift,
    status: 'forwarded',
    claimedByUserId: recipientUserId,
    claimedAt: nowIso(),
    forwardedToGiftId: nextId,
    updatedAt: nowIso(),
  };
  subscriptionGifts.set(gift.id, previous);

  addAudit(recipientUserId, 'gift.forwarded', actor, {
    giftId: gift.id,
    nextGiftId: nextId,
    rootGiftId: gift.rootGiftId,
    chainDepth: next.chainDepth,
  });
  return { previous, next };
}

export function getMyGifts(userId: string): { donated: SubscriptionGift[]; received: SubscriptionGift[] } {
  expireStaleGifts();
  const donated: SubscriptionGift[] = [];
  const received: SubscriptionGift[] = [];
  for (const gift of subscriptionGifts.values()) {
    if (gift.donorUserId === userId) donated.push(gift);
    if (gift.claimedByUserId === userId) received.push(gift);
  }
  const byCreatedDesc = (a: SubscriptionGift, b: SubscriptionGift) => b.createdAt.localeCompare(a.createdAt);
  donated.sort(byCreatedDesc);
  received.sort(byCreatedDesc);
  return { donated, received };
}
