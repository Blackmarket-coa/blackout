import { createReward, isValidCost, isValidRewardTitle } from '../../streams/channelPointsClient';
import type { ApiCallOptions } from '../../streams/channelPointsClient';
import type { OwnedStreamAsset } from './streamAssetGoods';

export interface ApplyRewardResult {
    title: string;
    status: 'ok' | 'skipped' | 'error';
    detail?: string;
}

/**
 * Apply a purchased channel-point reward kit to the creator's channel by
 * creating each reward via the existing channel-points API. Each reward is
 * isolated: an invalid config is skipped and a failure is recorded, so the rest
 * still apply. Returns a per-reward result list.
 */
export async function applyChannelPointKit(
    asset: OwnedStreamAsset,
    options?: ApiCallOptions
): Promise<ApplyRewardResult[]> {
    const results: ApplyRewardResult[] = [];
    for (const reward of asset.rewards ?? []) {
        if (!isValidRewardTitle(reward.title) || !isValidCost(reward.cost)) {
            results.push({ title: reward.title, status: 'skipped', detail: 'invalid title or cost' });
            continue;
        }
        try {
            // eslint-disable-next-line no-await-in-loop
            await createReward(
                { title: reward.title, cost: reward.cost, prompt: reward.prompt },
                options
            );
            results.push({ title: reward.title, status: 'ok' });
        } catch (err) {
            results.push({
                title: reward.title,
                status: 'error',
                detail: err instanceof Error ? err.message : undefined,
            });
        }
    }
    return results;
}
