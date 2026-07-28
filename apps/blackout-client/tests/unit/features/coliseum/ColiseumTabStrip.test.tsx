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
    it('renders only primary tabs on the strip, plus a More button', () => {
        const container = render(
            <ColiseumTabStrip activeTab="reel" onSelectTab={() => undefined} />
        );
        const stripTabs = Array.from(
            container.querySelectorAll('[role="tab"][data-coliseum-tab]')
        ).map((el) => el.getAttribute('data-coliseum-tab'));
        expect(stripTabs).toEqual(['reel', 'topics', 'knowledge', 'live', 'challenges']);
        expect(container.querySelector('[data-testid="coliseum-more-tab"]')).toBeTruthy();
        // Specialist tabs are not on the strip.
        expect(container.querySelector('[role="tab"][data-coliseum-tab="arena"]')).toBeNull();
        expect(container.querySelector('[role="tab"][data-coliseum-tab="debate"]')).toBeNull();
    });

    it('opens the More sheet and selects a secondary tab', () => {
        const onSelectTab = vi.fn();
        const container = render(<ColiseumTabStrip activeTab="reel" onSelectTab={onSelectTab} />);
        act(() => {
            (
                container.querySelector('[data-testid="coliseum-more-tab"]') as HTMLButtonElement
            ).click();
        });
        // The Sheet portals to document.body.
        const sheet = document.querySelector('[data-testid="coliseum-more-sheet"]');
        expect(sheet).toBeTruthy();
        act(() => {
            (sheet?.querySelector('[data-coliseum-tab="arena"]') as HTMLButtonElement).click();
        });
        expect(onSelectTab).toHaveBeenCalledWith('arena');
        expect(document.querySelector('[data-testid="coliseum-more-sheet"]')).toBeNull();
    });

    it('marks More as active while a secondary tab is open', () => {
        const container = render(
            <ColiseumTabStrip activeTab="leaderboards" onSelectTab={() => undefined} />
        );
        const more = container.querySelector('[data-testid="coliseum-more-tab"]');
        expect(more?.textContent).toContain('Leaderboards');
    });

    it('hides More when a den only enables primary tabs', () => {
        const container = render(
            <ColiseumTabStrip
                activeTab="topics"
                enabledTabs={['topics', 'live']}
                onSelectTab={() => undefined}
            />
        );
        expect(container.querySelector('[data-testid="coliseum-more-tab"]')).toBeNull();
    });
});
