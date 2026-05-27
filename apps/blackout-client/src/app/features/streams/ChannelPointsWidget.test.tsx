// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const listRewardsMock = vi.fn();
const fetchBalanceMock = vi.fn();
const redeemRewardMock = vi.fn();

vi.mock('./channelPointsClient', () => ({
    listRewards: (...a: unknown[]) => listRewardsMock(...a),
    fetchBalance: (...a: unknown[]) => fetchBalanceMock(...a),
    redeemReward: (...a: unknown[]) => redeemRewardMock(...a),
}));

import ChannelPointsWidget from './ChannelPointsWidget';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<ChannelPointsWidget channelId="creator-1" />);
        await flush();
    });
    return container;
};

describe('ChannelPointsWidget', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        listRewardsMock.mockReset();
        fetchBalanceMock.mockReset();
        redeemRewardMock.mockReset();
    });

    it('self-hides when the channel has no rewards', async () => {
        listRewardsMock.mockResolvedValue({ rewards: [] });
        fetchBalanceMock.mockResolvedValue({ balance: 0 });
        const container = await mount();
        expect(container.querySelector('[data-testid="channel-points-widget"]')).toBeNull();
    });

    it('shows balance + rewards, disabling unaffordable ones', async () => {
        listRewardsMock.mockResolvedValue({
            rewards: [
                { id: 'r1', creatorId: 'creator-1', title: 'Cheap', cost: 50, isActive: true, createdAt: '', updatedAt: '' },
                { id: 'r2', creatorId: 'creator-1', title: 'Pricey', cost: 500, isActive: true, createdAt: '', updatedAt: '' },
            ],
        });
        fetchBalanceMock.mockResolvedValue({ balance: 100 });
        const container = await mount();
        expect(container.querySelector('[data-testid="channel-points-balance"]')?.textContent).toBe('100 pts');
        const cheap = container.querySelector('[data-testid="channel-points-redeem-r1"]') as HTMLButtonElement;
        const pricey = container.querySelector('[data-testid="channel-points-redeem-r2"]') as HTMLButtonElement;
        expect(cheap.disabled).toBe(false);
        expect(pricey.disabled).toBe(true); // 100 < 500
    });

    it('redeems an affordable reward and updates the balance', async () => {
        listRewardsMock.mockResolvedValue({
            rewards: [
                { id: 'r1', creatorId: 'creator-1', title: 'Cheap', cost: 50, isActive: true, createdAt: '', updatedAt: '' },
            ],
        });
        fetchBalanceMock.mockResolvedValue({ balance: 100 });
        redeemRewardMock.mockResolvedValue({ redemptionId: 'x', rewardId: 'r1', balance: 50 });
        const container = await mount();
        const btn = container.querySelector('[data-testid="channel-points-redeem-r1"]') as HTMLButtonElement;
        await act(async () => {
            btn.click();
            await flush();
        });
        expect(redeemRewardMock).toHaveBeenCalledWith('creator-1', { rewardId: 'r1' });
        expect(container.querySelector('[data-testid="channel-points-balance"]')?.textContent).toBe('50 pts');
        expect(container.querySelector('[data-testid="channel-points-notice"]')?.textContent).toContain('Redeemed');
    });
});
