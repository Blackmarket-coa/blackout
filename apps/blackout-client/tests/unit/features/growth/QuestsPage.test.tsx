// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type {
    QuestCompletionRecord,
    QuestDefinitionRecord,
} from '../../../../src/app/features/growth/growthClient';

const fetchActiveQuests = vi.fn();
const fetchMyQuestCompletions = vi.fn();
const completeQuest = vi.fn();
vi.mock('../../../../src/app/features/growth/growthClient', () => ({
    fetchActiveQuests: (...a: unknown[]) => fetchActiveQuests(...a),
    fetchMyQuestCompletions: (...a: unknown[]) => fetchMyQuestCompletions(...a),
    completeQuest: (...a: unknown[]) => completeQuest(...a),
}));

import { QuestsPage } from '../../../../src/app/features/growth/QuestsPage';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
        await flush();
    });
    return container;
};

const quest = (over: Partial<QuestDefinitionRecord> = {}): QuestDefinitionRecord => ({
    id: 'q1',
    sourceKind: 'system',
    sourceRef: null,
    title: 'Invite three friends',
    description: 'Share your invite link with three people.',
    rewardKind: 'tip',
    rewardCents: 250,
    startsAt: null,
    endsAt: null,
    criteria: {},
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
});

const completion = (questId: string): QuestCompletionRecord => ({
    id: `c-${questId}`,
    questId,
    userId: '@me:bmc',
    rewardTipId: null,
    completedAt: '2026-06-02T00:00:00.000Z',
});

describe('QuestsPage', () => {
    beforeEach(() => {
        fetchActiveQuests.mockReset();
        fetchMyQuestCompletions.mockReset();
        completeQuest.mockReset();
    });

    it('renders an empty state when there are no active quests', async () => {
        fetchActiveQuests.mockResolvedValue({ items: [] });
        fetchMyQuestCompletions.mockResolvedValue({ items: [] });
        const container = await render(React.createElement(QuestsPage));
        expect(container.querySelector('[data-testid="growth-quests-empty"]')).not.toBeNull();
    });

    it('marks an active quest complete', async () => {
        fetchActiveQuests.mockResolvedValue({ items: [quest()] });
        fetchMyQuestCompletions.mockResolvedValue({ items: [] });
        completeQuest.mockResolvedValue({ completion: completion('q1') });
        const container = await render(React.createElement(QuestsPage));

        const button = container.querySelector(
            '[data-testid="growth-quest-complete-q1"]'
        ) as HTMLButtonElement;
        expect(button.textContent).toBe('Mark complete');

        await act(async () => {
            button.click();
            await flush();
        });

        expect(completeQuest).toHaveBeenCalledWith('q1');
        expect(
            container.querySelector('[data-testid="growth-quest-complete-q1"]')?.textContent
        ).toBe('Completed');
    });

    it('shows already-completed quests as completed', async () => {
        fetchActiveQuests.mockResolvedValue({ items: [quest()] });
        fetchMyQuestCompletions.mockResolvedValue({ items: [completion('q1')] });
        const container = await render(React.createElement(QuestsPage));
        const button = container.querySelector(
            '[data-testid="growth-quest-complete-q1"]'
        ) as HTMLButtonElement;
        expect(button.textContent).toBe('Completed');
        expect(button.disabled).toBe(true);
    });
});
