// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import {
    FAB_STACK_GAP,
    fabStackBottom,
    usePageFabSlot,
    usePageFabStackOffset,
} from '../../../src/app/hooks/useFabStack';

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
    return { container, root };
};

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

const PageFab = ({ height, visible = true }: { height: number; visible?: boolean }) => {
    usePageFabSlot(height, visible);
    return visible ? <button type="button">page</button> : null;
};

// jsdom rewrites `calc(...)` when read back off `style.bottom`, so the button
// records the value it was given in a data attribute instead.
const StackedFab = () => {
    const offset = usePageFabStackOffset();
    const bottom = fabStackBottom(offset);
    return (
        <button type="button" data-testid="stacked" data-bottom={bottom} style={{ bottom }}>
            stacked
        </button>
    );
};

const bottomOf = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-testid="stacked"]')?.dataset.bottom;

describe('fabStackBottom', () => {
    it('keeps the base slot above the tab bar and safe area', () => {
        expect(fabStackBottom()).toBe('calc(env(safe-area-inset-bottom, 0px) + 84px)');
    });

    it('adds the stack offset to the base slot', () => {
        expect(fabStackBottom(68)).toBe('calc(env(safe-area-inset-bottom, 0px) + 152px)');
    });

    it('ignores negative offsets', () => {
        expect(fabStackBottom(-10)).toBe(fabStackBottom(0));
    });
});

describe('FAB stacking', () => {
    it('sits in the base slot when no page FAB is mounted', () => {
        const { container } = render(<StackedFab />);
        expect(bottomOf(container)).toBe(fabStackBottom());
    });

    it('lifts above a mounted page FAB so the two never overlap', () => {
        const { container } = render(
            <>
                <PageFab height={56} />
                <StackedFab />
            </>
        );
        expect(bottomOf(container)).toBe(fabStackBottom(56 + FAB_STACK_GAP));
    });

    it('drops back to the base slot when the page FAB unmounts', () => {
        const App = ({ withPageFab }: { withPageFab: boolean }) => (
            <>
                {withPageFab ? <PageFab height={56} /> : null}
                <StackedFab />
            </>
        );
        const { container, root } = render(<App withPageFab />);
        expect(bottomOf(container)).toBe(fabStackBottom(56 + FAB_STACK_GAP));

        act(() => {
            root.render(<App withPageFab={false} />);
        });
        expect(bottomOf(container)).toBe(fabStackBottom());
    });

    it('releases the slot while the page FAB is hidden', () => {
        const App = ({ visible }: { visible: boolean }) => (
            <>
                <PageFab height={56} visible={visible} />
                <StackedFab />
            </>
        );
        const { container, root } = render(<App visible />);
        expect(bottomOf(container)).toBe(fabStackBottom(56 + FAB_STACK_GAP));

        act(() => {
            root.render(<App visible={false} />);
        });
        expect(bottomOf(container)).toBe(fabStackBottom());
    });

    it('clears the tallest page FAB when several are mounted', () => {
        const { container } = render(
            <>
                <PageFab height={48} />
                <PageFab height={56} />
                <StackedFab />
            </>
        );
        expect(bottomOf(container)).toBe(fabStackBottom(56 + FAB_STACK_GAP));
    });
});
