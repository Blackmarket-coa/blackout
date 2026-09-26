// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import React, { useRef } from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useHideOnScrollDown } from './useHideOnScrollDown';

let hidden = false;

const Probe = ({ enabled, resetKey }: { enabled: boolean; resetKey?: string }) => {
    const ref = useRef<HTMLElement>(null);
    hidden = useHideOnScrollDown(ref, enabled, resetKey);
    return (
        <main ref={ref}>
            <div data-testid="scroller" />
        </main>
    );
};

const mounted: ReactDOM.Root[] = [];

const render = async (enabled: boolean, resetKey?: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push(root);
    await act(async () => {
        root.render(<Probe enabled={enabled} resetKey={resetKey} />);
    });
    const scroller = container.querySelector('[data-testid="scroller"]') as HTMLElement;
    return {
        root,
        scrollTo: async (top: number) => {
            await act(async () => {
                scroller.scrollTop = top;
                scroller.dispatchEvent(new Event('scroll'));
            });
        },
        rerender: async (nextKey: string) => {
            await act(async () => {
                root.render(<Probe enabled={enabled} resetKey={nextKey} />);
            });
        },
    };
};

afterEach(() => {
    mounted.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = '';
    hidden = false;
});

describe('useHideOnScrollDown', () => {
    it('hides while scrolling down a nested scroller and reveals on scroll up', async () => {
        const { scrollTo } = await render(true);
        await scrollTo(100);
        await scrollTo(200);
        expect(hidden).toBe(true);
        await scrollTo(150);
        expect(hidden).toBe(false);
    });

    it('ignores sub-threshold jitter and always reveals near the top', async () => {
        const { scrollTo } = await render(true);
        await scrollTo(100);
        await scrollTo(104);
        expect(hidden).toBe(false);
        await scrollTo(300);
        expect(hidden).toBe(true);
        await scrollTo(10);
        expect(hidden).toBe(false);
    });

    it('never hides when disabled (desktop)', async () => {
        const { scrollTo } = await render(false);
        await scrollTo(100);
        await scrollTo(400);
        expect(hidden).toBe(false);
    });

    it('reveals again when the reset key changes (route change)', async () => {
        const { scrollTo, rerender } = await render(true, '/a');
        await scrollTo(100);
        await scrollTo(400);
        expect(hidden).toBe(true);
        await rerender('/b');
        expect(hidden).toBe(false);
    });
});
