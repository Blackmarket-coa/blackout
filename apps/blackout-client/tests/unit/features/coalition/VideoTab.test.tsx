// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const mocks = vi.hoisted(() => ({
    fetchCoalitionFeed: vi.fn(),
    fetchFeedLikes: vi.fn(),
    setFeedLike: vi.fn(),
    fetchFeedComments: vi.fn(),
    postFeedComment: vi.fn(),
}));

vi.mock('../../../../src/app/features/coalition/coalitionClient', () => ({
    fetchCoalitionFeed: mocks.fetchCoalitionFeed,
    fetchFeedLikes: mocks.fetchFeedLikes,
    setFeedLike: mocks.setFeedLike,
    fetchFeedComments: mocks.fetchFeedComments,
    postFeedComment: mocks.postFeedComment,
}));

// eslint-disable-next-line import/first
import { VideoTab } from '../../../../src/app/features/coalition/tabs/VideoTab';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const VIDEO = {
    id: 'v1',
    kind: 'video' as const,
    title: 'Test clip',
    createdAt: '2026-06-01T00:00:00Z',
    importance: 0.5,
    impact: 0.5,
    socialImpact: 0.5,
    score: 0.5,
};

const mountedRoots: ReactDOM.Root[] = [];

const flush = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};

const render = async (element: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(element);
    });
    await flush();
    mountedRoots.push(root);
    return container;
};

beforeEach(() => {
    mocks.fetchCoalitionFeed.mockResolvedValue({ generatedAt: 'now', items: [VIDEO] });
    mocks.fetchFeedLikes.mockResolvedValue({ count: 0, likedByMe: false });
    mocks.setFeedLike.mockResolvedValue({ count: 1, likedByMe: true });
    mocks.fetchFeedComments.mockResolvedValue({ comments: [] });
    mocks.postFeedComment.mockResolvedValue({
        comment: { id: 'c1', feedItemId: 'v1', authorId: '@me', body: 'great', createdAt: 'now' },
    });
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

const setTextareaValue = (el: HTMLTextAreaElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
    )?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('VideoTab', () => {
    it('renders the video feed and persists a like via the client', async () => {
        const container = await render(<VideoTab scope={{}} />);
        expect(container.textContent).toContain('Test clip');

        const likeBtn = container.querySelector(
            '[data-testid="coalition-video-like-v1"]'
        ) as HTMLButtonElement;
        expect(likeBtn).toBeTruthy();

        await act(async () => {
            likeBtn.click();
        });
        await flush();

        expect(mocks.setFeedLike).toHaveBeenCalledWith('v1', true);
        // After the optimistic refetch the button reflects the liked count.
        expect(mocks.fetchFeedLikes).toHaveBeenCalled();
    });

    it('posts a comment via the client', async () => {
        const container = await render(<VideoTab scope={{}} />);

        const commentToggle = container.querySelector(
            '[data-testid="coalition-video-comment-v1"]'
        ) as HTMLButtonElement;
        await act(async () => {
            commentToggle.click();
        });
        await flush();

        const input = container.querySelector(
            '[data-testid="coalition-video-comment-input-v1"]'
        ) as HTMLTextAreaElement;
        expect(input).toBeTruthy();
        await act(async () => {
            setTextareaValue(input, 'great video');
        });

        const submit = container.querySelector(
            '[data-testid="coalition-video-comment-submit-v1"]'
        ) as HTMLButtonElement;
        await act(async () => {
            submit.click();
        });
        await flush();

        expect(mocks.postFeedComment).toHaveBeenCalledWith('v1', 'great video');
    });
});
