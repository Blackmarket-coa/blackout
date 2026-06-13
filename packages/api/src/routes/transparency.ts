import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { requireUser } from '../middleware/require-user';
import { entitlementTierForUser, getSubscription } from '../services/subscriptions';
import { listBurnersForOwner } from '../services/burnerIdentities';
import { signCanary } from '../services/canarySigning';
import { TRANSPARENCY_ENTITLEMENT_KEYS, TRANSPARENCY_TIER_ENTITLEMENTS } from '@blackout/protocol';
import type { EntitlementTier } from '@blackout/protocol';

const transparency = new Hono();

const tierHas = (tier: EntitlementTier, key: string): boolean =>
  Boolean((TRANSPARENCY_TIER_ENTITLEMENTS[tier] as Record<string, boolean>)[key]);

/** A burner is active while it hasn't been burned and hasn't expired. */
const isActiveBurner = (b: { burnedAt: string | null; expiresAt: string | null }): boolean =>
  b.burnedAt === null && (b.expiresAt === null || Date.parse(b.expiresAt) > Date.now());

const transparencyEntitlements = (tier: EntitlementTier) => ({
  enabled: tierHas(tier, TRANSPARENCY_ENTITLEMENT_KEYS.enabled),
  selfReport: tierHas(tier, TRANSPARENCY_ENTITLEMENT_KEYS.selfReport),
  auditExport: tierHas(tier, TRANSPARENCY_ENTITLEMENT_KEYS.auditExport),
  warrantCanary: tierHas(tier, TRANSPARENCY_ENTITLEMENT_KEYS.warrantCanary),
});

/**
 * Server-side "what's stored about me" report (OSS-manifest G9). Complements
 * the client-side view (devices/rooms/localStorage read from the live session)
 * with the server-held account record: subscription, burner-identity count,
 * and the caller's effective transparency entitlements. Free for every tier.
 */
transparency.get('/me', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const tier = entitlementTierForUser(user.sub);
  const subscription = getSubscription(user.sub);
  const burners = listBurnersForOwner(user.sub);

  return c.json({
    userId: user.sub,
    generatedAt: new Date().toISOString(),
    subscription: {
      tier: subscription.tier,
      status: subscription.status,
      isPaid: subscription.entitlementActive,
    },
    counts: {
      activeBurnerIdentities: burners.filter(isActiveBurner).length,
      totalBurnerIdentities: burners.length,
    },
    entitlements: transparencyEntitlements(tier),
  });
});

/**
 * Warrant canary (OSS-manifest G9). Returns a structured, dated affirmation,
 * a sha256 integrity digest, and an Ed25519 signature over the canonical
 * statement so clients can cryptographically verify authenticity (the public
 * key travels with the response for verification).
 */
transparency.get('/canary', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();

  const statement = [
    'As of the generation date below, Blackout has not received any National',
    'Security Letter, FISA court order, gag order, or other secret request for',
    'user data that we are prohibited from disclosing, and no warrant canary',
    'we maintain has been compelled to be removed.',
  ].join(' ');

  const canonical = `${statement}|${periodStart}|${periodEnd}`;
  const digest = createHash('sha256').update(canonical).digest('hex');
  const signed = signCanary(canonical);

  return c.json({
    statement,
    periodStart,
    periodEnd,
    generatedAt: now.toISOString(),
    digestAlgorithm: 'sha256',
    digest,
    // Ed25519 signature over `${statement}|${periodStart}|${periodEnd}`.
    signatureAlgorithm: signed.algorithm,
    signatureKeySource: signed.keySource,
    signature: signed.signature,
    publicKey: signed.publicKey,
  });
});

/**
 * Org-scoped audit export (OSS-manifest G9). A `team`+ capability: returns a
 * machine-readable export of the records the server holds for the caller.
 * Unentitled callers get a 402 tier prompt rather than an empty export.
 */
transparency.get('/audit-export', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const tier = entitlementTierForUser(user.sub);
  if (!tierHas(tier, TRANSPARENCY_ENTITLEMENT_KEYS.auditExport)) {
    return c.json(
      {
        code: 'audit_export_not_entitled',
        message: 'Org-scoped audit export requires the Team tier or higher.',
        suggestedTier: 'team',
      },
      402,
    );
  }

  const subscription = getSubscription(user.sub);
  const burners = listBurnersForOwner(user.sub);

  return c.json({
    schema: 'blackout.transparency.audit-export.v1',
    userId: user.sub,
    generatedAt: new Date().toISOString(),
    subscription,
    burnerIdentities: burners,
    entitlements: transparencyEntitlements(tier),
  });
});

export default transparency;
