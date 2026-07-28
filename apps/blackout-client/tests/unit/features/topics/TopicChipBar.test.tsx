// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router';

const listTopics = vi.fn();
vi.mock('../../../../src/app/features/topics/topicsClient', () => ({
    listTopics: (...args: unknown[]) => listTopics(...args),
}));

const followedRef: { current: Set<string> } = { current: new Set() };
vi.mock('../../../../src/app/features/home/discoveryInterests', () => ({
    useTopicFollows: () => ({
        followed: followedRef.current,
        isFollowing: (tag: string) => followedRef.current.has(tag),
        follow: vi.fn(),
        unfollow: vi.fn(),
        canFollow: true,
    }),
}));

import { TopicChipBar } from '../../../../src/app/features/topics/TopicChipBar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
};

const mountedRoots: ReactDOM.Root[] = [];

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
        root.render(<MemoryRouter>{node}</MemoryRouter>);
        await flush();
    });
    return container;
};

beforeEach(() => {
    followedRef.current = new Set();
    listTopics.mockResolvedValue({ items: [] });
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

const chipLabels = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll('[data-tag-label]')).map(
        (chip) => chip.getAttribute('data-tag-label') ?? ''
    );

describe('TopicChipBar', () => {
    it('pins followed topics ahead of trending and stars them', async () => {
        followedRef.current = new Set(['gardens']);
        listTopics.mockResolvedValue({
            items: [
                { tag: 'ai', count: 9 },
                { tag: 'gardens', count: 5 },
            ],
        });
        const container = await render(<TopicChipBar />);
        expect(chipLabels(container)).toEqual(['gardens', 'ai']);
        const followedChip = container.querySelector('[data-testid="topic-chip-followed"]');
        expect(followedChip?.textContent).toContain('★ gardens');
        expect(followedChip?.textContent).toContain('5');
    });

    it('keeps followed pins visible when trending fails', async () => {
        followedRef.current = new Set(['gardens']);
        listTopics.mockRejectedValue(new Error('offline'));
        const container = await render(<TopicChipBar />);
        expect(chipLabels(container)).toEqual(['gardens']);
    });

    it('renders nothing with no follows and no trending topics', async () => {
        const container = await render(<TopicChipBar />);
        expect(container.querySelector('[data-testid="topic-chip-bar"]')).toBeNull();
    });
});
