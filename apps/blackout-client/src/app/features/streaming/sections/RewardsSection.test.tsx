// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchMyAmbassadorMock = vi.fn();
const fetchMyReferralsMock = vi.fn();
const fetchActiveQuestsMock = vi.fn();
const fetchMyMigrationCreditsMock = vi.fn();
const completeQuestMock = vi.fn();
const redeemMigrationCreditMock = vi.fn();

vi.mock('../../growth', () => ({
    fetchMyAmbassador: (...a: unknown[]) => fetchMyAmbassadorMock(...a),
    fetchMyReferrals: (...a: unknown[]) => fetchMyReferralsMock(...a),
    fetchActiveQuests: (...a: unknown[]) => fetchActiveQuestsMock(...a),
    fetchMyMigrationCredits: (...a: unknown[]) => fetchMyMigrationCreditsMock(...a),
    completeQuest: (...a: unknown[]) => completeQuestMock(...a),
    redeemMigrationCredit: (...a: unknown[]) => redeemMigrationCreditMock(...a),
}));

import RewardsSection from './RewardsSection';

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
        root.render(<RewardsSection />);
        await flush();
    });
    return { container };
};

describe('RewardsSection', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        for (const m of [
            fetchMyAmbassadorMock,
            fetchMyReferralsMock,
            fetchActiveQuestsMock,
            fetchMyMigrationCreditsMock,
            completeQuestMock,
            redeemMigrationCreditMock,
        ]) {
            m.mockReset();
        }
    });

    it('renders the stat cards and an active quest with a claim action', async () => {
        fetchMyAmbassadorMock.mockResolvedValue({ ambassador: null });
        fetchMyReferralsMock.mockResolvedValue({ items: [] });
        fetchMyMigrationCreditsMock.mockResolvedValue({ items: [] });
        fetchActiveQuestsMock.mockResolvedValue({
            items: [
                {
                    id: 'quest-1',
                    sourceKind: 'system',
                    sourceRef: null,
                    title: 'Go live this week',
                    description: 'Stream once',
                    rewardKind: 'tip',
                    rewardCents: 500,
                    startsAt: null,
                    endsAt: null,
                    criteria: {},
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z',
                },
            ],
        });
        completeQuestMock.mockResolvedValue({ completion: {} });

        const { container } = await mount();
        expect(container.querySelector('[data-testid="rewards-stats"]')).not.toBeNull();
        const row = container.querySelector('[data-testid="rewards-quest-row"]');
        expect(row).not.toBeNull();

        const claim = container.querySelector<HTMLButtonElement>(
            '[data-testid="rewards-quest-claim"]'
        );
        await act(async () => {
            claim?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });
        expect(completeQuestMock).toHaveBeenCalledWith('quest-1');
        // Claimed quest is removed from the active list.
        expect(container.querySelector('[data-testid="rewards-quest-row"]')).toBeNull();
    });

    it('degrades to a friendly message when the ambassador fetch is forbidden', async () => {
        const forbidden = Object.assign(new Error('Request failed (403)'), { status: 403 });
        fetchMyAmbassadorMock.mockRejectedValue(forbidden);
        fetchMyReferralsMock.mockRejectedValue(forbidden);
        fetchActiveQuestsMock.mockRejectedValue(forbidden);
        fetchMyMigrationCreditsMock.mockRejectedValue(forbidden);

        const { container } = await mount();
        expect(container.querySelector('[data-testid="rewards-forbidden"]')).not.toBeNull();
    });
});
