import { Hono } from 'hono';
import type { EntitlementAccessPayload, EntitlementFamily, EntitlementMap, EntitlementReadResponse, EntitlementTier } from '@blackout/protocol';
import { DEAD_DROP_TIER_ENTITLEMENTS, buildFullyUnlockedEntitlementPayload } from '@blackout/protocol';
import type { MarketplaceProviderId } from '@blackout/core';
import { getSubscription } from '../services/subscriptions';
import { requireUser } from '../middleware/require-user';
import { entitlementForListing } from '../services/entitlementChecks';
import { betaUnlockAllEnabled } from '../services/betaUnlock';

const VALID_PROVIDER_IDS: MarketplaceProviderId[] = [
  'freeblackmarket',
  'blamazon',
  'mayhem-marketplaze',
  'antin-amazon',
];

const entitlements = new Hono();

const featurePrefixes: Record<EntitlementFamily, string> = {
  stego: 'features.stego.',
  governance: 'features.governance.',
  deaddrop: 'features.deaddrop.',
};

const deaddropEntitlementsForTier = (tier: EntitlementTier): EntitlementMap =>
  DEAD_DROP_TIER_ENTITLEMENTS[tier] as EntitlementMap;

function defaultPayload(): EntitlementAccessPayload {
  if (betaUnlockAllEnabled()) return buildFullyUnlockedEntitlementPayload();
  return {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: {
      'features.stego.enabled': true,
      'features.stego.ephemeral': false,
      'features.governance.entitlements': false,
      ...deaddropEntitlementsForTier('free'),
    },
    orgTier: 'free',
    orgTierEntitlements: {
      'features.stego.enabled': true,
      'features.stego.ephemeral': false,
      'features.governance.entitlements': false,
      ...deaddropEntitlementsForTier('free'),
    },
    planState: {
      tier: 'free',
      status: 'canceled',
      isPaid: false,
    },
  };
}

function canonicalPayloadFromSubscription(userId: string): EntitlementAccessPayload {
  if (betaUnlockAllEnabled()) return buildFullyUnlockedEntitlementPayload();
  const subscription = getSubscription(userId);
  const paid = subscription.entitlementActive;
  const premium = subscription.tier !== 'free';
  const tier: EntitlementTier =
    subscription.tier === 'canopy_pro' ? 'enterprise' : subscription.tier === 'sprout' ? 'pro' : 'free';

  const entitlementSet: EntitlementMap = {
    'features.stego.enabled': true,
    'features.stego.ephemeral': paid,
    'features.governance.entitlements': paid,
    'features.canopy.premium': paid,
    'features.canopy.priority_support': premium,
    ...deaddropEntitlementsForTier(tier),
  };

  return {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: entitlementSet,
    orgTier: tier,
    orgTierEntitlements: entitlementSet,
    planState: {
      tier,
      status: subscription.status,
      isPaid: paid,
      trialEndsAt: subscription.trialEndsAt ?? undefined,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt ?? undefined,
    },
  };
}

function familyFilteredPayload(payload: EntitlementAccessPayload, family: EntitlementFamily): EntitlementAccessPayload {
  const prefix = featurePrefixes[family];
  const selectFamily = (map: EntitlementAccessPayload['deploymentPresetEntitlements'] | undefined) => {
    if (!map) return undefined;
    return Object.fromEntries(Object.entries(map).filter(([key]) => key.startsWith(prefix)));
  };

  return {
    ...payload,
    deploymentPresetEntitlements: selectFamily(payload.deploymentPresetEntitlements) ?? {},
    orgTierEntitlements: selectFamily(payload.orgTierEntitlements),
    userOverrideEntitlements: selectFamily(payload.userOverrideEntitlements),
  };
}

function toResponse(payload: EntitlementAccessPayload, family: EntitlementFamily | 'all'): EntitlementReadResponse {
  return {
    family,
    payload,
  };
}

// Single-listing access gate used by paywalled posts and event tickets.
// Returns `canAccess: true` iff the authenticated user currently holds an
// active (granted/pending) entitlement for this provider+listing pair.
// Optional `sku` query narrows the match for variant-bearing listings.
entitlements.get('/listings/:providerId/:providerListingId', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const providerId = c.req.param('providerId') as MarketplaceProviderId;
  if (!VALID_PROVIDER_IDS.includes(providerId)) {
    return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
  }
  const sku = c.req.query('sku') ?? null;
  const gate = entitlementForListing(
    user.sub,
    providerId,
    c.req.param('providerListingId'),
    sku
  );
  return c.json(gate);
});

entitlements.get('/me', (c) => {
  try {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const payload = canonicalPayloadFromSubscription(user.sub);
    return c.json(toResponse(payload, 'all'));
  } catch {
    return c.json({ code: 'invalid_entitlements_payload', message: 'Unable to parse entitlement payload.' }, 400);
  }
});

entitlements.get('/:family', (c) => {
  const family = c.req.param('family');
  if (family !== 'stego' && family !== 'governance' && family !== 'deaddrop') {
    return c.json({ code: 'invalid_entitlement_family', message: 'Family must be stego, governance, or deaddrop.' }, 400);
  }

  try {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const payload = canonicalPayloadFromSubscription(user.sub);
    return c.json(toResponse(familyFilteredPayload(payload, family), family));
  } catch {
    return c.json({ code: 'invalid_entitlements_payload', message: 'Unable to parse entitlement payload.' }, 400);
  }
});

export default entitlements;
