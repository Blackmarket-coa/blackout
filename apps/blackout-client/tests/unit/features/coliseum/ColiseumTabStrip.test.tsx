// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { ColiseumTabStrip } from '../../../../src/app/features/coliseum/ColiseumTabStrip';

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

describe('ColiseumTabStrip', () => {
    it('renders the five cross-topic destinations and no overflow button', () => {
        const container = render(
            <ColiseumTabStrip activeTab="topics" onSelectTab={() => undefined} />
        );
        const stripTabs = Array.from(
            container.querySelectorAll('[role="tab"][data-coliseum-tab]')
        ).map((el) => el.getAttribute('data-coliseum-tab'));
        expect(stripTabs).toEqual(['topics', 'reel', 'knowledge', 'challenges', 'leaderboards']);
        // The "More" sheet is gone: it held five surfaces that are now sections
        // of a topic, and it was what pushed the strip off a phone screen.
        expect(container.querySelector('[data-testid="coliseum-more-tab"]')).toBeNull();
    });

    it('keeps topic-scoped surfaces off the strip entirely', () => {
        const container = render(
            <ColiseumTabStrip activeTab="topics" onSelectTab={() => undefined} />
        );
        for (const tab of ['arena', 'match', 'shouts', 'sources', 'live', 'debate']) {
            expect(container.querySelector(`[role="tab"][data-coliseum-tab="${tab}"]`)).toBeNull();
        }
    });

    it('shortens Leaderboards so five labels fit a phone', () => {
        const container = render(
            <ColiseumTabStrip activeTab="topics" onSelectTab={() => undefined} />
        );
        expect(container.querySelector('[data-coliseum-tab="leaderboards"]')?.textContent).toBe(
            'Ranks'
        );
    });

    it('reports the picked tab to the caller', () => {
        const onSelectTab = vi.fn();
        const container = render(<ColiseumTabStrip activeTab="topics" onSelectTab={onSelectTab} />);
        act(() => {
            (
                container.querySelector('[data-coliseum-tab="knowledge"]') as HTMLButtonElement
            ).click();
        });
        expect(onSelectTab).toHaveBeenCalledWith('knowledge');
    });

    it('honours per-den enabledTabs gating', () => {
        const container = render(
            <ColiseumTabStrip
                activeTab="topics"
                enabledTabs={['topics', 'knowledge']}
                onSelectTab={() => undefined}
            />
        );
        const stripTabs = Array.from(
            container.querySelectorAll('[role="tab"][data-coliseum-tab]')
        ).map((el) => el.getAttribute('data-coliseum-tab'));
        expect(stripTabs).toEqual(['topics', 'knowledge']);
    });
});
