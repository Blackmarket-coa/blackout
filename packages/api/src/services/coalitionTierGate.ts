/**
 * Resolves a member's personal KARMA tier for a coalition's optional
 * minimum-tier-to-join gate.
 *
 * The ladder is FBM's (Seedling → Sprout → Root → Canopy → Ancestor); it is
 * read, never computed here, so there is exactly one reputation system in the
 * ecosystem. The FBM entitlements client is read-only and — until FBM's
 * economic-standing answer carries `karmaTier` — reports nothing tier-shaped,
 * in which case everyone resolves to the lowest rung. That fails open only
 * for gates set at `seedling` (which admits everyone anyway) and fails closed
 * for every higher gate, which is the honest behaviour: a gate the server
 * cannot verify must not be waved through.
 */
import { isCoalitionTierGate, type CoalitionTierGate } from '@blackout/core';
import { getEntitlementsClient } from '../integrations/fbm/entitlementsClientFactory';
import { matrixUserIdFor } from './userIdentity';

export type TierResolver = (userId: string) => Promise<CoalitionTierGate>;

async function defaultResolver(userId: string): Promise<CoalitionTierGate> {
    const client = getEntitlementsClient();
    const mxid = matrixUserIdFor(userId);
    if (!client || !mxid) return 'seedling';
    try {
        const standing = (await client.getEconomicStanding(mxid)) as { karmaTier?: unknown };
        const tier =
            typeof standing.karmaTier === 'string' ? standing.karmaTier.toLowerCase() : null;
        return isCoalitionTierGate(tier) ? tier : 'seedling';
    } catch {
        return 'seedling';
    }
}

let resolver: TierResolver = defaultResolver;

export function resolveMemberTier(userId: string): Promise<CoalitionTierGate> {
    return resolver(userId);
}

/** Test seam: inject a resolver; pass null to restore the FBM-backed default. */
export function __setTierResolverForTests(next: TierResolver | null): void {
    resolver = next ?? defaultResolver;
}
