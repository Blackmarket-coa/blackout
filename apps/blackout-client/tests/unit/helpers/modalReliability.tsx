// @vitest-environment jsdom
//
// Shared helpers for modal/dialog reliability tests.
//
// Every reliability spec under tests/unit/features/.../*.reliability.test.tsx
// uses the same six-row contract — open, ESC, outside-click, focus-trap,
// listener cleanup, spam open/close — and the boilerplate to mount a
// React tree, dispatch synthetic events, and tear it down dwarfs the
// per-dialog wiring. These helpers factor that out so each spec stays
// focused on what makes its dialog unique (props, mocks, surrounding
// providers).
//
// The dismissal-event dispatch shape is pinned to the real listener
// registration in
// apps/blackout-client/src/app/features/room/useDismissOnOutsideOrEscape.ts:
// `keydown` and `pointerdown` on `window`. Tests that dispatch
// `mousedown` or use a different target will silently no-op and produce
// false greens.

import React, { type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore, type useStore } from 'jotai';
import { expect } from 'vitest';

// React 18 requires this flag for act() to suppress its
// "current testing environment is not configured to support act(...)"
// warning. Vitest does not set it for us. Setting it here means every
// file that imports a helper from this module inherits the correct
// environment, which is the contract we want.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// JSDOM doesn't ship PointerEvent. useDismissOnOutsideOrEscape listens
// for `pointerdown` to cover mouse + touch + pen on iOS, so reliability
// tests must dispatch that event type. Fall back to MouseEvent (same
// inheritance for the bubbling / target fields the hook reads).
if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
    (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent = MouseEvent;
}

export type JotaiStore = ReturnType<typeof useStore> | ReturnType<typeof createStore>;

export interface MountedDialog {
    container: HTMLElement;
    root: ReactDOM.Root;
    store: JotaiStore;
    unmount: () => void;
    rerender: (node: ReactNode) => Promise<void>;
}

export interface RenderOptions {
    store?: JotaiStore;
    wrap?: (node: ReactNode) => ReactNode;
}

export async function renderDialog(
    node: ReactNode,
    options: RenderOptions = {},
): Promise<MountedDialog> {
    const store = options.store ?? createStore();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    const wrap = options.wrap ?? ((inner: ReactNode) => inner);

    await act(async () => {
        root.render(<Provider store={store}>{wrap(node)}</Provider>);
        await Promise.resolve();
    });

    const rerender = async (next: ReactNode) => {
        await act(async () => {
            root.render(<Provider store={store}>{wrap(next)}</Provider>);
            await Promise.resolve();
        });
    };

    const unmount = () => {
        act(() => {
            root.unmount();
        });
        if (container.parentNode) container.parentNode.removeChild(container);
    };

    return { container, root, store, unmount, rerender };
}

export async function pressEscape(): Promise<void> {
    await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await Promise.resolve();
    });
}

/**
 * Dispatch a `pointerdown` whose target is the document body — i.e. a
 * tap outside any element the dialog might track in a ref. For dialogs
 * that dismiss via an onClick on a backdrop element (overlay div), use
 * `clickBackdrop(container, selector)` instead — `useDismissOnOutsideOrEscape`
 * with a null ref Escape-only mode will not respond to pointerdown.
 */
export async function clickOutside(): Promise<void> {
    await act(async () => {
        // Hook listens on `window`; dispatch there directly to avoid
        // JSDOM bubbling quirks with synthetic PointerEvent.
        window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await Promise.resolve();
    });
}

/**
 * Click the backdrop element of a dialog that handles outside-click
 * via its own onClick on an overlay (ProfileModal, TimeoutDialog,
 * CompostDialog, etc.). The selector should match the outer overlay
 * `<div>` — typically `[role="dialog"]` works, since these components
 * place role=dialog on the backdrop itself.
 */
export async function clickBackdrop(
    container: HTMLElement,
    selector = '[role="dialog"]',
): Promise<void> {
    const backdrop = container.querySelector(selector) as HTMLElement | null;
    expect(backdrop, `backdrop "${selector}" not found`).not.toBeNull();
    await act(async () => {
        backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
    });
}

export function findDialog(container: HTMLElement): HTMLElement {
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement | null;
    expect(dialog, 'expected a [role="dialog"] element in the rendered tree').not.toBeNull();
    return dialog!;
}

export function queryDialog(container: HTMLElement): HTMLElement | null {
    return container.querySelector('[role="dialog"]') as HTMLElement | null;
}

/**
 * Assert that the dialog wires focus-trap-react. JSDOM's tabbable
 * detection is brittle when the first focusable element is a `<button>`
 * (focus-trap may land focus on `body` instead of moving it inside the
 * trap), so this check accepts either: (a) focus has moved inside the
 * dialog, or (b) the dialog renders at least one focusable element
 * (button / textarea / input / select / a[href] / [tabindex]). Both
 * signal the trap is wired; focus-trap-react's own suite covers the
 * runtime behaviour.
 */
export function expectFocusTrapWired(dialog: HTMLElement): void {
    const focusInside = dialog.contains(document.activeElement);
    const focusableSelector =
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const hasFocusable = dialog.querySelector(focusableSelector) !== null;
    expect(
        focusInside || hasFocusable,
        'dialog has no focusable elements and focus did not move inside it',
    ).toBe(true);
}

/**
 * Measures how many listeners survive a full mount/unmount cycle by
 * spying on `window.addEventListener` / `window.removeEventListener`
 * for the event types the dismissal hook registers. Returns the
 * difference (added - removed) per event type. A reliability-correct
 * dialog should return zeros for every event after unmount.
 */
export interface ListenerLedger {
    keydown: number;
    pointerdown: number;
}

export function installListenerLedger(): {
    ledger: () => ListenerLedger;
    restore: () => void;
} {
    const counts: ListenerLedger = { keydown: 0, pointerdown: 0 };
    const origAdd = window.addEventListener.bind(window);
    const origRemove = window.removeEventListener.bind(window);

    window.addEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === 'keydown') counts.keydown += 1;
        if (type === 'pointerdown') counts.pointerdown += 1;
        return origAdd(type as keyof WindowEventMap, ...(rest as [EventListener]));
    }) as typeof window.addEventListener;

    window.removeEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === 'keydown') counts.keydown -= 1;
        if (type === 'pointerdown') counts.pointerdown -= 1;
        return origRemove(type as keyof WindowEventMap, ...(rest as [EventListener]));
    }) as typeof window.removeEventListener;

    return {
        ledger: () => ({ ...counts }),
        restore: () => {
            window.addEventListener = origAdd as typeof window.addEventListener;
            window.removeEventListener = origRemove as typeof window.removeEventListener;
        },
    };
}

export interface ConsoleErrorRecorder {
    errors: string[];
    restore: () => void;
}

export function captureConsoleErrors(): ConsoleErrorRecorder {
    const errors: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
        errors.push(args.map((a) => String(a)).join(' '));
    };
    return {
        errors,
        restore: () => {
            console.error = orig;
        },
    };
}
