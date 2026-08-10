// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { ColiseumKnowledgeEntry } from '@blackout/core';

const fetchColiseumKnowledge = vi.fn();
const createColiseumExplainer = vi.fn();
const voteColiseumExplainer = vi.fn();
vi.mock('../coliseumClient', () => ({
    fetchColiseumKnowledge: (...a: unknown[]) => fetchColiseumKnowledge(...a),
    createColiseumExplainer: (...a: unknown[]) => createColiseumExplainer(...a),
    voteColiseumExplainer: (...a: unknown[]) => voteColiseumExplainer(...a),
}));

import { KnowledgeTab } from './KnowledgeTab';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

// Roots are tracked so `afterEach` can unmount them. Without that, KnowledgeTab
// stays mounted past the end of the test file and its search-debounce
// `window.setTimeout` (KnowledgeTab.tsx:115) fires after vitest tears down this
// file's jsdom environment — react-dom then touches `window` and the whole run
// fails with an unhandled `ReferenceError: window is not defined`, with every
// test still reported as passing. Unmounting runs the effect's own
// `clearTimeout`, so the timer never outlives the environment.
const mountedRoots: ReactDOM.Root[] = [];

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
        await flush();
    });
    mountedRoots.push(root);
    return container;
};

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

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
    beforeEach(() => {
        fetchColiseumKnowledge.mockReset();
        createColiseumExplainer.mockReset();
        voteColiseumExplainer.mockReset();
    });

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

    it('publishes an explainer through the composer and refetches', async () => {
        fetchColiseumKnowledge.mockResolvedValue({
            generatedAt: new Date().toISOString(),
            entries: [],
        });
        createColiseumExplainer.mockResolvedValue({
            explainer: { id: 'exp1', title: 'Loop', upVotes: 0, downVotes: 0 },
        });
        const container = await render(React.createElement(KnowledgeTab));

        await act(async () => {
            (
                container.querySelector(
                    '[data-testid="knowledge-compose-toggle"]'
                ) as HTMLButtonElement
            ).click();
            await flush();
        });
        const title = container.querySelector(
            '[data-testid="explainer-title"]'
        ) as HTMLInputElement;
        const body = container.querySelector(
            '[data-testid="explainer-body"]'
        ) as HTMLTextAreaElement;
        await act(async () => {
            const setInput = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            )!.set!;
            setInput.call(title, 'How the loop works');
            title.dispatchEvent(new Event('input', { bubbles: true }));
            const setTextarea = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
            )!.set!;
            setTextarea.call(body, 'Three stages of smelting.');
            body.dispatchEvent(new Event('input', { bubbles: true }));
            await flush();
        });
        await act(async () => {
            (
                container.querySelector('[data-testid="explainer-publish"]') as HTMLButtonElement
            ).click();
            await flush();
        });
        expect(createColiseumExplainer).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'How the loop works',
                body: 'Three stages of smelting.',
            })
        );
        // The list refetches after publishing (mount + publish).
        expect(fetchColiseumKnowledge.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('endorses an explainer entry with a helpful vote', async () => {
        fetchColiseumKnowledge.mockResolvedValue({
            generatedAt: new Date().toISOString(),
            entries: [
                entry({
                    id: 'explainer:exp1',
                    kind: 'explainer',
                    title: 'How the loop works',
                    sourceId: 'exp1',
                }),
            ],
        });
        voteColiseumExplainer.mockResolvedValue({ explainer: { id: 'exp1' } });
        const container = await render(React.createElement(KnowledgeTab));

        await act(async () => {
            (
                container.querySelector(
                    '[data-testid="knowledge-endorse-button"]'
                ) as HTMLButtonElement
            ).click();
            await flush();
        });
        expect(voteColiseumExplainer).toHaveBeenCalledWith('exp1', 'up');
    });
});
