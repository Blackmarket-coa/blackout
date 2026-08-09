// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { BACK_INTENT_EVENT, dispatchBackIntent } from '../../platform/back-intent';
import { useBackIntent } from './useBackIntent';

/**
 * The shell-side decision is covered in blackout-mobile/test/back-intent.test.ts.
 * This covers the client half: that the hook actually claims the press while a
 * surface is open, and releases it when the surface closes or unmounts —
 * otherwise back would stay swallowed after the overlay is gone.
 */
const Probe = ({ active, onBack }: { active: boolean; onBack: () => void }) => {
    useBackIntent(active, onBack);
    return null;
};

// The hook listens on `window`, so a root left mounted keeps claiming presses
// in later tests. Track every root and unmount it between cases — clearing
// document.body is not enough, it does not tear down React roots.
const mounted: ReactDOM.Root[] = [];

const render = async (active: boolean, onBack: () => void) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push(root);
    await act(async () => {
        root.render(<Probe active={active} onBack={onBack} />);
    });
    return {
        root,
        rerender: async (next: boolean) => {
            await act(async () => {
                root.render(<Probe active={next} onBack={onBack} />);
            });
        },
    };
};

describe('useBackIntent', () => {
    beforeEach(() => {
        for (const root of mounted.splice(0)) {
            act(() => root.unmount());
        }
        document.body.innerHTML = '';
    });

    it('claims the press and runs the handler while active', async () => {
        const onBack = vi.fn();
        await render(true, onBack);

        let consumed = false;
        await act(async () => {
            consumed = dispatchBackIntent(window);
        });

        expect(consumed).toBe(true);
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('leaves the press alone while inactive', async () => {
        const onBack = vi.fn();
        await render(false, onBack);

        let consumed = true;
        await act(async () => {
            consumed = dispatchBackIntent(window);
        });

        expect(consumed).toBe(false);
        expect(onBack).not.toHaveBeenCalled();
    });

    it('releases the press when the surface closes', async () => {
        const onBack = vi.fn();
        const { rerender } = await render(true, onBack);
        await rerender(false);

        let consumed = true;
        await act(async () => {
            consumed = dispatchBackIntent(window);
        });

        expect(consumed).toBe(false);
        expect(onBack).not.toHaveBeenCalled();
    });

    it('releases the press on unmount', async () => {
        const onBack = vi.fn();
        const { root } = await render(true, onBack);
        await act(async () => {
            root.unmount();
        });

        let consumed = true;
        await act(async () => {
            consumed = dispatchBackIntent(window);
        });

        expect(consumed).toBe(false);
        expect(onBack).not.toHaveBeenCalled();
    });

    it('exposes the event name the native shell dispatches', () => {
        expect(BACK_INTENT_EVENT).toBe('blackout:back');
    });
});
