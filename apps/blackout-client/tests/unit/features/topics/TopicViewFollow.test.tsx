// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';

const listCanopiesByTag = vi.fn();
const listTopics = vi.fn();
vi.mock('../../../../src/app/features/topics/topicsClient', () => ({
    listTopics: (...args: unknown[]) => listTopics(...args),
    listCanopiesByTag: (...args: unknown[]) => listCanopiesByTag(...args),
}));

const follow = vi.fn().mockResolvedValue(undefined);
const unfollow = vi.fn().mockResolvedValue(undefined);
const followedRef: { current: Set<string> } = { current: new Set() };
vi.mock('../../../../src/app/features/home/discoveryInterests', () => ({
    useTopicFollows: () => ({
        followed: followedRef.current,
        isFollowing: (tag: string) => followedRef.current.has(tag),
        follow,
        unfollow,
        canFollow: true,
    }),
}));

import { TopicView } from '../../../../src/app/features/topics/TopicView';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
};

const mountedRoots: ReactDOM.Root[] = [];

const renderTopic = async (tag: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={[`/topics/${encodeURIComponent(tag)}`]}>
                <Routes>
                    <Route path="/topics/:tag" element={<TopicView />} />
                </Routes>
            </MemoryRouter>
        );
        await flush();
    });
    return container;
};

beforeEach(() => {
    followedRef.current = new Set();
    listTopics.mockResolvedValue({ items: [] });
    listCanopiesByTag.mockResolvedValue({ tag: 'gardens', items: [] });
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('TopicView follow button', () => {
    it('follows the topic from the header button', async () => {
        const container = await renderTopic('gardens');
        const button = container.querySelector(
            '[data-testid="topic-follow-button"]'
        ) as HTMLButtonElement;
        expect(button).toBeTruthy();
        expect(button.textContent).toContain('Follow topic');

        await act(async () => {
            button.click();
            await flush();
        });
        expect(follow).toHaveBeenCalledWith('gardens');
    });

    it('shows the following state and unfollows on tap', async () => {
        followedRef.current = new Set(['gardens']);
        const container = await renderTopic('gardens');
        const button = container.querySelector(
            '[data-testid="topic-follow-button"]'
        ) as HTMLButtonElement;
        expect(button.textContent).toContain('Following');
        expect(button.getAttribute('aria-pressed')).toBe('true');

        await act(async () => {
            button.click();
            await flush();
        });
        expect(unfollow).toHaveBeenCalledWith('gardens');
    });
});
