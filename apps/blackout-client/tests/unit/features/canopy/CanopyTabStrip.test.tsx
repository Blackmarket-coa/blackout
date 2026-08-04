// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { CanopyTabStrip } from '../../../../src/app/features/canopy/CanopyTabStrip';

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

describe('CanopyTabStrip', () => {
    it('renders all four tabs with no overflow sheet', () => {
        const container = render(
            <CanopyTabStrip activeTab="yours" onSelectTab={() => undefined} />
        );
        const tabs = Array.from(container.querySelectorAll('[role="tab"][data-canopy-tab]')).map(
            (el) => el.getAttribute('data-canopy-tab')
        );
        expect(tabs).toEqual(['yours', 'discover', 'friends', 'create']);
        // The whole point of the consolidation: the strip fits, so there is no
        // "More" escape hatch to build.
        expect(container.querySelector('[data-testid="canopy-more-tab"]')).toBeNull();
    });

    it('marks only the active tab as selected', () => {
        const container = render(
            <CanopyTabStrip activeTab="discover" onSelectTab={() => undefined} />
        );
        const selected = Array.from(container.querySelectorAll('[role="tab"]'))
            .filter((el) => el.getAttribute('aria-selected') === 'true')
            .map((el) => el.getAttribute('data-canopy-tab'));
        expect(selected).toEqual(['discover']);
    });

    it('reports the picked tab to the caller', () => {
        const onSelectTab = vi.fn();
        const container = render(<CanopyTabStrip activeTab="yours" onSelectTab={onSelectTab} />);
        act(() => {
            (
                container.querySelector('[data-testid="canopy-tab-friends"]') as HTMLButtonElement
            ).click();
        });
        expect(onSelectTab).toHaveBeenCalledWith('friends');
    });

    it('badges a tab when it has a pending count, and omits the badge at zero', () => {
        const container = render(
            <CanopyTabStrip
                activeTab="yours"
                onSelectTab={() => undefined}
                counts={{ friends: 3 }}
            />
        );
        const friends = container.querySelector('[data-testid="canopy-tab-friends"]');
        const discover = container.querySelector('[data-testid="canopy-tab-discover"]');
        expect(friends?.textContent).toContain('3');
        expect(discover?.textContent).toBe('Discover');
    });

    it('clamps a large count rather than blowing out the strip width', () => {
        const container = render(
            <CanopyTabStrip
                activeTab="yours"
                onSelectTab={() => undefined}
                counts={{ friends: 250 }}
            />
        );
        expect(
            container.querySelector('[data-testid="canopy-tab-friends"]')?.textContent
        ).toContain('99+');
    });
});
