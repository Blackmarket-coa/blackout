/**
 * Resolves a member's KARMA tier for a coalition's optional
 * minimum-tier-to-join gate.
 *
 * The ladder is FBM's, read and never computed here, so there is exactly one
 * reputation system in the ecosystem. It is FBM's **coalition** ladder — XP
 * earned by coalition work, which Blackout itself reports through
 * `coalitionReputation.ts` — and deliberately not the grower ladder: that one
 * is keyed on seller id, fed by PRODUCER-stance XP, its rungs set payout rates,
 * and a member who has never sold anything has no rung on it at all. Gating a
 * community on it would have meant gating on vendor sales volume.
 *
 * The resolution is three-valued on purpose. Before this, every failure —
 * FBM unconfigured, no linked identity, a timeout, a thrown request — returned
 * `seedling`, indistinguishable from a real member who has simply not earned
 * anything yet. Since FBM served no tier at all, that meant *everyone*
 * resolved to the floor, and every coalition whose founder picked a rung above
 * it quietly queued 100% of its joiners for steward review, including the ones
 * that had chosen open joining. Nobody was told.
 *
 * So: `known` carries a tier that can be compared, and `unknown` carries why
 * it could not be. The join path routes an unknown answer to a human, and
 * never tells someone their standing is too low on the strength of a lookup
 * that did not happen.
 */
import { isCoalitionTierGate, type CoalitionTierGate } from '@blackout/core';
import { getEntitlementsClient } from '../integrations/fbm/entitlementsClientFactory';
import { matrixUserIdFor } from './userIdentity';

export type TierUnknownReason =
    /** No FBM integration configured on this deployment. */
    | 'unconfigured'
    /** This member has no Matrix id, so there is nothing to ask FBM about. */
    | 'no_identity'
    /** FBM was asked and could not answer. */
    | 'lookup_failed';

export type TierResolution =
    | { known: true; tier: CoalitionTierGate }
    | { known: false; reason: TierUnknownReason };

export type TierResolver = (userId: string) => Promise<TierResolution>;

async function defaultResolver(userId: string): Promise<TierResolution> {
    const client = getEntitlementsClient();
    if (!client) return { known: false, reason: 'unconfigured' };
    const mxid = matrixUserIdFor(userId);
    if (!mxid) return { known: false, reason: 'no_identity' };
    try {
        const standing = (await client.getEconomicStanding(mxid)) as {
            coalitionKarmaTier?: unknown;
        };
        const raw = standing.coalitionKarmaTier;
        // FBM answers `null` for a member it cannot place — no linked customer,
        // or its own progression read failed. That is not "seedling"; it is the
        // same not-knowing as a timeout, and it has to stay distinguishable.
        if (typeof raw !== 'string') return { known: false, reason: 'lookup_failed' };
        const tier = raw.toLowerCase();
        return isCoalitionTierGate(tier)
            ? { known: true, tier }
            : { known: false, reason: 'lookup_failed' };
    } catch {
        return { known: false, reason: 'lookup_failed' };
    }
}

let resolver: TierResolver = defaultResolver;

export function resolveMemberTier(userId: string): Promise<TierResolution> {
    return resolver(userId);
}

/** Test seam: inject a resolver; pass null to restore the FBM-backed default. */
export function __setTierResolverForTests(next: TierResolver | null): void {
    resolver = next ?? defaultResolver;
}
