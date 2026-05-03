import { Hono } from 'hono';
import type { EntitlementAccessPayload, EntitlementFamily, EntitlementMap, EntitlementReadResponse, EntitlementTier } from '@blackout/protocol';
import { DEAD_DROP_TIER_ENTITLEMENTS, parseEntitlementAccessPayload } from '@blackout/protocol';
import { getSubscription } from '../services/subscriptions';

const entitlements = new Hono();

const featurePrefixes: Record<EntitlementFamily, string> = {
  stego: 'features.stego.',
  governance: 'features.governance.',
  deaddrop: 'features.deaddrop.',
};

const deaddropEntitlementsForTier = (tier: EntitlementTier): EntitlementMap =>
  DEAD_DROP_TIER_ENTITLEMENTS[tier] as EntitlementMap;

function defaultPayload(): EntitlementAccessPayload {
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

function readPayloadFromHeader(rawHeader: string | undefined): EntitlementAccessPayload {
  if (!rawHeader) return defaultPayload();
  const parsed = JSON.parse(rawHeader) as unknown;
  return parseEntitlementAccessPayload(parsed);
}

function canonicalPayloadFromSubscription(userId: string): EntitlementAccessPayload {
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
  if (family !== 'stego' && family !== 'governance' && family !== 'deaddrop') {
    return c.json({ code: 'invalid_entitlement_family', message: 'Family must be stego, governance, or deaddrop.' }, 400);
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
