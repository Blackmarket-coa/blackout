// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { TopicSeedLine } from '../../../../src/app/features/coliseum/components/TopicSeedLine';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const render = (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(node);
    });
    mountedRoots.push(root);
    return container;
};

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

const LINK = {
    kind: 'link' as const,
    sourceUrl: 'https://news.example/story',
    headline: 'Something happened',
    publishedAt: '2026-05-02T10:00:00Z',
};

describe('TopicSeedLine', () => {
    it('renders a link seed as a click-through to the article', () => {
        const container = render(<TopicSeedLine seed={LINK} />);
        const link = container.querySelector('[data-testid="topic-seed-link"]');
        expect(link?.tagName).toBe('A');
        expect(link?.getAttribute('href')).toBe('https://news.example/story');
        expect(link?.textContent).toContain('Something happened');
    });

    it('renders a link seed inert inside a feed card, so the card keeps the tap', () => {
        const container = render(<TopicSeedLine seed={LINK} inert />);
        const link = container.querySelector('[data-testid="topic-seed-link"]');
        // A nested anchor would swallow the tap that opens the topic.
        expect(link?.tagName).toBe('SPAN');
        expect(link?.textContent).toContain('Something happened');
    });

    it('labels a bare text seed — the case that was impossible before', () => {
        const container = render(<TopicSeedLine seed={{ kind: 'text' }} />);
        expect(container.querySelector('[data-testid="topic-seed-text"]')).toBeTruthy();
    });

    it('distinguishes a video take from an image take', () => {
        const video = render(
            <TopicSeedLine seed={{ kind: 'media', media: { kind: 'video', mxc: 'mxc://s/a' } }} />
        );
        expect(video.querySelector('[data-testid="topic-seed-media"]')?.textContent).toContain(
            'Video'
        );
        const image = render(
            <TopicSeedLine seed={{ kind: 'media', media: { kind: 'image', mxc: 'mxc://s/b' } }} />
        );
        expect(image.querySelector('[data-testid="topic-seed-media"]')?.textContent).toContain(
            'Image'
        );
    });

    it('names the opponent on a targeted challenge, and says open when there is none', () => {
        const targeted = render(
            <TopicSeedLine seed={{ kind: 'challenge', opponentId: '@rival:server' }} />
        );
        expect(
            targeted.querySelector('[data-testid="topic-seed-challenge"]')?.textContent
        ).toContain('@rival:server');

        const open = render(<TopicSeedLine seed={{ kind: 'challenge', open: true }} />);
        expect(open.querySelector('[data-testid="topic-seed-challenge"]')?.textContent).toContain(
            'Open challenge'
        );
    });

    /**
     * The client and the API deploy independently, so a topic can arrive from a
     * server that predates seeds. That must degrade, not blank the debate.
     */
    it('reconstructs a link seed from a legacy newsAnchor when no seed is present', () => {
        const container = render(<TopicSeedLine newsAnchor={LINK} />);
        const link = container.querySelector('[data-testid="topic-seed-link"]');
        expect(link?.getAttribute('href')).toBe('https://news.example/story');
    });

    it('falls back to a text seed when the topic carries neither', () => {
        const container = render(<TopicSeedLine />);
        expect(container.querySelector('[data-testid="topic-seed-text"]')).toBeTruthy();
    });
});
