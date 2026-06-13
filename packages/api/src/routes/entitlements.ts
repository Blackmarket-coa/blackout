import { Hono } from 'hono';
import type { EntitlementAccessPayload, EntitlementFamily, EntitlementMap, EntitlementReadResponse, EntitlementTier } from '@blackout/protocol';
import { DEAD_DROP_TIER_ENTITLEMENTS, PERSONA_TIER_ENTITLEMENTS, HARDENING_TIER_ENTITLEMENTS, TRANSPARENCY_TIER_ENTITLEMENTS, ACTIVE_DEFENSE_TIER_ENTITLEMENTS, SHIELD_TIER_ENTITLEMENTS, MESH_TIER_ENTITLEMENTS, buildFullyUnlockedEntitlementPayload, parseEntitlementAccessPayload } from '@blackout/protocol';
import type { MarketplaceProviderId } from '@blackout/core';
import { getSubscription, entitlementTierForUser } from '../services/subscriptions';
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
  persona: 'features.persona.',
  hardening: 'features.hardening.',
  transparency: 'features.transparency.',
  activedefense: 'features.activedefense.',
  shield: 'features.shield.',
  mesh: 'features.mesh.',
};

const deaddropEntitlementsForTier = (tier: EntitlementTier): EntitlementMap =>
  DEAD_DROP_TIER_ENTITLEMENTS[tier] as EntitlementMap;

const personaEntitlementsForTier = (tier: EntitlementTier): EntitlementMap =>
  PERSONA_TIER_ENTITLEMENTS[tier] as EntitlementMap;

const hardeningEntitlementsForTier = (tier: EntitlementTier): EntitlementMap =>
  HARDENING_TIER_ENTITLEMENTS[tier] as EntitlementMap;

const transparencyEntitlementsForTier = (tier: EntitlementTier): EntitlementMap =>
  TRANSPARENCY_TIER_ENTITLEMENTS[tier] as EntitlementMap;

const activeDefenseEntitlementsForTier = (tier: EntitlementTier): EntitlementMap =>
  ACTIVE_DEFENSE_TIER_ENTITLEMENTS[tier] as EntitlementMap;

const shieldEntitlementsForTier = (tier: EntitlementTier): EntitlementMap =>
  SHIELD_TIER_ENTITLEMENTS[tier] as EntitlementMap;

const meshEntitlementsForTier = (tier: EntitlementTier): EntitlementMap =>
  MESH_TIER_ENTITLEMENTS[tier] as EntitlementMap;

function defaultPayload(): EntitlementAccessPayload {
  if (betaUnlockAllEnabled()) return buildFullyUnlockedEntitlementPayload();
  return {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: {
      'features.stego.enabled': true,
      'features.stego.ephemeral': false,
      'features.governance.entitlements': false,
      ...deaddropEntitlementsForTier('free'),
      ...personaEntitlementsForTier('free'),
      ...hardeningEntitlementsForTier('free'),
      ...transparencyEntitlementsForTier('free'),
      ...activeDefenseEntitlementsForTier('free'),
      ...shieldEntitlementsForTier('free'),
      ...meshEntitlementsForTier('free'),
    },
    orgTier: 'free',
    orgTierEntitlements: {
      'features.stego.enabled': true,
      'features.stego.ephemeral': false,
      'features.governance.entitlements': false,
      ...deaddropEntitlementsForTier('free'),
      ...personaEntitlementsForTier('free'),
      ...hardeningEntitlementsForTier('free'),
      ...transparencyEntitlementsForTier('free'),
      ...activeDefenseEntitlementsForTier('free'),
      ...shieldEntitlementsForTier('free'),
      ...meshEntitlementsForTier('free'),
    },
    planState: {
      tier: 'free',
      status: 'canceled',
      isPaid: false,
    },
  };
}

function readPayloadFromHeader(rawHeader: string | undefined): EntitlementAccessPayload {
  if (!rawHeader) return defaultPayload();
  const parsed = JSON.parse(rawHeader) as unknown;
  return parseEntitlementAccessPayload(parsed);
}

function canonicalPayloadFromSubscription(userId: string): EntitlementAccessPayload {
  if (betaUnlockAllEnabled()) return buildFullyUnlockedEntitlementPayload();
  const subscription = getSubscription(userId);
  const paid = subscription.entitlementActive;
  const premium = subscription.tier !== 'free';
  const tier: EntitlementTier = entitlementTierForUser(userId);

  const entitlementSet: EntitlementMap = {
    'features.stego.enabled': true,
    'features.stego.ephemeral': paid,
    'features.governance.entitlements': paid,
    'features.canopy.premium': paid,
    'features.canopy.priority_support': premium,
    ...deaddropEntitlementsForTier(tier),
    ...personaEntitlementsForTier(tier),
    ...hardeningEntitlementsForTier(tier),
    ...transparencyEntitlementsForTier(tier),
    ...activeDefenseEntitlementsForTier(tier),
    ...shieldEntitlementsForTier(tier),
    ...meshEntitlementsForTier(tier),
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
    const user = c.get('user') as { sub?: string } | null;
    const payload = user?.sub
      ? canonicalPayloadFromSubscription(user.sub)
      : readPayloadFromHeader(c.req.header('x-blackout-entitlement-payload'));
    return c.json(toResponse(payload, 'all'));
  } catch {
    return c.json({ code: 'invalid_entitlements_payload', message: 'Unable to parse entitlement payload.' }, 400);
  }
});

entitlements.get('/:family', (c) => {
  const family = c.req.param('family');
  if (
    family !== 'stego' &&
    family !== 'governance' &&
    family !== 'deaddrop' &&
    family !== 'persona' &&
    family !== 'hardening' &&
    family !== 'transparency' &&
    family !== 'activedefense' &&
    family !== 'shield' &&
    family !== 'mesh'
  ) {
    return c.json({ code: 'invalid_entitlement_family', message: 'Family must be stego, governance, deaddrop, persona, hardening, transparency, activedefense, shield, or mesh.' }, 400);
  }

  try {
    const user = c.get('user') as { sub?: string } | null;
    const payload = user?.sub
      ? canonicalPayloadFromSubscription(user.sub)
      : readPayloadFromHeader(c.req.header('x-blackout-entitlement-payload'));
    return c.json(toResponse(familyFilteredPayload(payload, family), family));
  } catch {
    return c.json({ code: 'invalid_entitlements_payload', message: 'Unable to parse entitlement payload.' }, 400);
  }
});

export default entitlements;
