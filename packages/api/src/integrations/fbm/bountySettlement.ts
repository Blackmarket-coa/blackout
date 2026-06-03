import type { BountyReward } from '@blackout/core';
import { log } from '../../telemetry/logger';

/**
 * FBM bounty-reward settlement bridge — STUB.
 *
 * FBM (FreeBlackMarket) owns the payout/ledger rails and lives in a separate
 * repository, so this calls an *assumed* FBM endpoint
 * (`POST /v1/bounty-settlements`) against the documented contract. It is a
 * deliberate no-op (returns `null`) whenever FBM is not configured or the
 * reward is non-monetary, so bounty completion never depends on FBM
 * reachability. When FBM is wired up, a successful settlement returns the
 * payout reference that flips the reward to `settled`.
 *
 * Until the FBM side ships its endpoint, this is unverifiable end-to-end; the
 * shape mirrors the existing `freeblackmarket` provider's config + call style.
 */

interface FbmSettlementConfig {
    baseUrl: string;
    apiKey: string;
    enabled: boolean;
}

function readConfig(env: NodeJS.ProcessEnv = process.env): FbmSettlementConfig {
    return {
        baseUrl: env.FREEBLACKMARKET_BASE_URL ?? 'https://api.freeblackmarket.com',
        apiKey: env.FREEBLACKMARKET_API_KEY ?? '',
        enabled: (env.FREEBLACKMARKET_ENABLED ?? 'true') !== 'false',
    };
}

export interface BountySettlementResult {
    /** Payout reference recorded on the reward, e.g. `fbm:<settlementId>`. */
    settledRef: string;
}

/**
 * Best-effort settlement of an earned bounty reward through FBM. Returns the
 * payout reference on success, or `null` when FBM is unconfigured, the reward
 * is non-monetary, or the call fails (callers leave the reward `earned`).
 */
export async function settleBountyRewardViaFbm(
    reward: BountyReward,
    fetchImpl: typeof fetch = fetch,
): Promise<BountySettlementResult | null> {
    const cfg = readConfig();
    // Not configured → no settlement attempt. Keeps completion FBM-independent.
    if (!cfg.enabled || !cfg.apiKey) return null;
    // Only monetary rewards settle through the payout rail.
    if (reward.rewardCents == null || reward.rewardCents <= 0) return null;

    try {
        const response = await fetchImpl(new URL('/v1/bounty-settlements', cfg.baseUrl), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${cfg.apiKey}`,
            },
            body: JSON.stringify({
                bountyId: reward.bountyId,
                beneficiaryId: reward.beneficiaryId,
                amountCents: reward.rewardCents,
                rewardType: reward.rewardType,
                memo: reward.rewardSummary,
            }),
        });
        if (!response.ok) {
            log.warn('fbm_bounty_settlement_failed', {
                status: response.status,
                bountyId: reward.bountyId,
            });
            return null;
        }
        const data = (await response.json()) as { settlementId?: string };
        if (!data.settlementId) return null;
        return { settledRef: `fbm:${data.settlementId}` };
    } catch (error) {
        log.warn('fbm_bounty_settlement_error', {
            bountyId: reward.bountyId,
            error: String(error),
        });
        return null;
    }
}
