import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { requireUser } from '../middleware/require-user';
import { entitlementTierForUser, getSubscription } from '../services/subscriptions';
import { listBurnersForOwner } from '../services/burnerIdentities';
import { signCanary } from '../services/canarySigning';
import { describeWarrantCanary, readWarrantCanary } from '../services/warrantCanary';
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
 * Warrant canary (OSS-manifest G9). Reports the statement the operator has
 * issued, never one of the server's own making (services/warrantCanary.ts
 * says why, and how the operator issues one):
 * - `current`: the statement, the day the operator made it and the last day
 *   it stands;
 * - `lapsed`: the same statement and dates, past that day, not renewed;
 * - `not_issued`: none, with no statement, digest or signature.
 *
 * With a statement come a sha256 digest and an Ed25519 signature over
 * `${statement}|${issuedOn}|${validUntil}`. What the signature shows is
 * limited, and services/canarySigning.ts says so: the key is one this server
 * holds and signs with as it answers, so it shows that the response came from
 * a holder of that key, not that a person signed anything; and the public key
 * in the response proves nothing by itself, because whoever answers chooses
 * it. It is worth checking only against a copy of the key the operator has
 * published somewhere else.
 */
transparency.get('/canary', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const now = new Date();
    const canary = readWarrantCanary(process.env, now);
    const detail = describeWarrantCanary(canary);
    if (canary.status === 'not_issued') {
        return c.json({
            status: canary.status,
            reason: canary.reason,
            detail,
            statement: null,
            issuedOn: null,
            validUntil: null,
            checkedAt: now.toISOString(),
            digestAlgorithm: 'sha256',
            digest: null,
            signatureAlgorithm: 'ed25519',
            signatureKeySource: null,
            signature: null,
            publicKey: null,
        });
    }

    const digest = createHash('sha256').update(canary.canonical).digest('hex');
    const signed = signCanary(canary.canonical);

    return c.json({
        status: canary.status,
        detail,
        statement: canary.statement,
        issuedOn: canary.issuedOn,
        validUntil: canary.validUntil,
        checkedAt: now.toISOString(),
        digestAlgorithm: 'sha256',
        digest,
        // Ed25519 signature over `${statement}|${issuedOn}|${validUntil}`.
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
            402
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
