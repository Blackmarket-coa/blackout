// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchActiveQuestsMock = vi.fn();
const completeQuestMock = vi.fn();
const fetchMyQuestCompletionsMock = vi.fn();

vi.mock('../../growth', () => ({
    fetchActiveQuests: (...a: unknown[]) => fetchActiveQuestsMock(...a),
    completeQuest: (...a: unknown[]) => completeQuestMock(...a),
    fetchMyQuestCompletions: (...a: unknown[]) => fetchMyQuestCompletionsMock(...a),
}));

import { QuestsSlice } from './QuestsSlice';
import { runtimeFeatureFlags } from '../../../core/features/featureFlags';

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
        root.render(<QuestsSlice />);
        await flush();
    });
    return { container, root };
};

describe('QuestsSlice', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchActiveQuestsMock.mockReset();
        completeQuestMock.mockReset();
        fetchMyQuestCompletionsMock.mockReset();
    });

    afterEach(() => {
        runtimeFeatureFlags.growthQuestsUi = false;
    });

    it('renders the placeholder slice when growthQuestsUi is off', async () => {
        runtimeFeatureFlags.growthQuestsUi = false;
        const { container } = await mount();
        expect(container.textContent).toContain('Welcome streak');
        expect(container.textContent).toContain('Seasonal challenge');
        expect(fetchActiveQuestsMock).not.toHaveBeenCalled();
    });

    it('renders the live ledger when the flag is on', async () => {
        runtimeFeatureFlags.growthQuestsUi = true;
        fetchActiveQuestsMock.mockResolvedValue({
            items: [
                {
                    id: 'q1',
                    sourceKind: 'system',
                    sourceRef: null,
                    title: 'Daily login',
                    description: 'Sign in for 3 days',
                    rewardKind: 'tip',
                    rewardCents: 500,
                    startsAt: null,
                    endsAt: null,
                    criteria: {},
                    createdAt: '2026-05-01T00:00:00Z',
                    updatedAt: '2026-05-01T00:00:00Z',
                },
            ],
        });
        fetchMyQuestCompletionsMock.mockResolvedValue({ items: [] });

        const { container } = await mount();

        expect(fetchActiveQuestsMock).toHaveBeenCalledTimes(1);
        expect(container.textContent).toContain('Daily login');
        expect(container.textContent).toContain('Sign in for 3 days');
        expect(container.textContent).toContain('Reward: $5.00');
        expect(container.textContent).toContain('Available to claim');
        expect(container.querySelector('button')?.textContent).toBe('Claim');
    });

    it('claims a quest and refreshes the slice', async () => {
        runtimeFeatureFlags.growthQuestsUi = true;
        const quest = {
            id: 'q2',
            sourceKind: 'system' as const,
            sourceRef: null,
            title: 'Streak',
            description: 'desc',
            rewardKind: 'tip' as const,
            rewardCents: 200,
            startsAt: null,
            endsAt: null,
            criteria: {},
            createdAt: '2026-05-01T00:00:00Z',
            updatedAt: '2026-05-01T00:00:00Z',
        };
        fetchActiveQuestsMock.mockResolvedValue({ items: [quest] });
        fetchMyQuestCompletionsMock.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({
            items: [
                {
                    id: 'c1',
                    questId: 'q2',
                    userId: 'u1',
                    rewardTipId: null,
                    completedAt: '2026-05-06T00:00:00Z',
                },
            ],
        });
        completeQuestMock.mockResolvedValue({
            completion: {
                id: 'c1',
                questId: 'q2',
                userId: 'u1',
                rewardTipId: null,
                completedAt: '2026-05-06T00:00:00Z',
            },
        });

        const { container } = await mount();
        const button = container.querySelector('button');
        expect(button).not.toBeNull();
        await act(async () => {
            button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });

        expect(completeQuestMock).toHaveBeenCalledWith('q2');
        expect(container.textContent).toContain('Claimed — awaiting webhook');
        expect(container.querySelector('button')).toBeNull();
    });

    it('renders an empty-state message when the live ledger has no active quests', async () => {
        runtimeFeatureFlags.growthQuestsUi = true;
        fetchActiveQuestsMock.mockResolvedValue({ items: [] });
        fetchMyQuestCompletionsMock.mockResolvedValue({ items: [] });

        const { container } = await mount();
        expect(container.textContent).toContain('No active quests right now.');
    });

    it('surfaces an error message when fetchActiveQuests rejects', async () => {
        runtimeFeatureFlags.growthQuestsUi = true;
        fetchActiveQuestsMock.mockRejectedValue(new Error('boom'));
        fetchMyQuestCompletionsMock.mockResolvedValue({ items: [] });
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { container } = await mount();
        expect(container.textContent).toContain('Unable to load active quests.');
        consoleWarn.mockRestore();
    });
});
