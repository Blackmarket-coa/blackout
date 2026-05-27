import { describe, expect, it, vi } from 'vitest';
import {
    decodeBlackoutUserId,
    isValidCost,
    isValidRewardTitle,
    listRewards,
    redeemReward,
} from './channelPointsClient';

const makeJwt = (payload: Record<string, unknown>): string => {
    const b64 = (o: unknown) =>
        Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
};

describe('channelPointsClient validators', () => {
    it('validates reward titles and costs', () => {
        expect(isValidRewardTitle('Play my song')).toBe(true);
        expect(isValidRewardTitle('  ')).toBe(false);
        expect(isValidCost(100)).toBe(true);
        expect(isValidCost(0)).toBe(false);
        expect(isValidCost(1.5)).toBe(false);
    });
});

describe('decodeBlackoutUserId', () => {
    it('extracts sub from a JWT', () => {
        expect(decodeBlackoutUserId(makeJwt({ sub: 'user-42' }))).toBe('user-42');
    });
    it('returns null for missing/garbage tokens', () => {
        expect(decodeBlackoutUserId(null)).toBeNull();
        expect(decodeBlackoutUserId('not-a-jwt')).toBeNull();
        expect(decodeBlackoutUserId(makeJwt({ nosub: true }))).toBeNull();
    });
});

describe('channelPointsClient requests', () => {
    it('builds channel-scoped paths and reward routes', async () => {
        const apiClient = vi.fn().mockResolvedValue({ rewards: [] });
        await listRewards('chan-1', { apiClient });
        expect(apiClient).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v1/channel-points/channels/chan-1/rewards',
        });

        apiClient.mockResolvedValue({ redemptionId: 'x', rewardId: 'r1', balance: 0 });
        await redeemReward('chan-1', { rewardId: 'r1', userInput: 'hi' }, { apiClient });
        expect(apiClient).toHaveBeenLastCalledWith({
            method: 'POST',
            path: '/v1/channel-points/channels/chan-1/redeem',
            body: { rewardId: 'r1', userInput: 'hi' },
        });
    });
});
