// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { ColiseumKnowledgeEntry } from '@blackout/core';

const fetchColiseumKnowledge = vi.fn();
vi.mock('../coliseumClient', () => ({
    fetchColiseumKnowledge: (...a: unknown[]) => fetchColiseumKnowledge(...a),
}));

import { KnowledgeTab } from './KnowledgeTab';

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

const entry = (over: Partial<ColiseumKnowledgeEntry> = {}): ColiseumKnowledgeEntry => ({
    id: 'brief:b1',
    kind: 'brief',
    title: 'Xylotherm reactors are safe.',
    domain: 'business',
    tags: [],
    summary: 'Challenger won',
    authorIds: ['red', 'blue'],
    verdictConfidence: 0.8,
    sourcingScore: 0.6,
    steelmanScore: 0.4,
    insightScore: 0.65,
    resolvedAt: new Date().toISOString(),
    sourceId: 'match1',
    ...over,
});

describe('KnowledgeTab', () => {
    beforeEach(() => fetchColiseumKnowledge.mockReset());

    it('loads the archive on mount and renders ranked entries', async () => {
        fetchColiseumKnowledge.mockResolvedValue({
            generatedAt: new Date().toISOString(),
            entries: [
                entry(),
                entry({
                    id: 'debate:t1',
                    kind: 'debate_verdict',
                    title: 'Should Quorlith Bay ban gill nets?',
                    domain: 'science',
                    summary: 'Winner: Ban gill nets…',
                    insightScore: 0.5,
                }),
            ],
        });
        const container = await render(React.createElement(KnowledgeTab));
        expect(fetchColiseumKnowledge).toHaveBeenCalledWith({
            query: undefined,
            domain: undefined,
            kind: undefined,
        });
        const cards = container.querySelectorAll('[data-testid="coliseum-knowledge-entry"]');
        expect(cards.length).toBe(2);
        expect(container.textContent).toContain('Xylotherm reactors are safe.');
        expect(container.textContent).toContain('Confidence 80%');
    });

    it('refetches with the domain filter when a domain chip is pressed', async () => {
        fetchColiseumKnowledge.mockResolvedValue({
            generatedAt: new Date().toISOString(),
            entries: [],
        });
        const container = await render(React.createElement(KnowledgeTab));
        const scienceChip = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent === 'Science'
        );
        expect(scienceChip).toBeTruthy();
        await act(async () => {
            scienceChip!.click();
            await flush();
        });
        expect(fetchColiseumKnowledge).toHaveBeenLastCalledWith({
            query: undefined,
            domain: 'science',
            kind: undefined,
        });
    });

    it('shows the empty state when nothing has resolved yet', async () => {
        fetchColiseumKnowledge.mockResolvedValue({
            generatedAt: new Date().toISOString(),
            entries: [],
        });
        const container = await render(React.createElement(KnowledgeTab));
        expect(container.textContent).toContain('Nothing settled yet');
    });
});
