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
 * Probe that an active focus-trap-react trap is wired around the
 * dialog. focus-trap-react attaches a document-level `focusin`
 * listener and snaps any focus event whose target lives outside the
 * trap back onto a node inside it. We exercise that contract directly:
 * focus an outsider element, dispatch focusin, and assert focus has
 * been pulled back into the dialog.
 *
 * Failure mode: if `<FocusTrap>` is removed from the dialog (or
 * mis-wired), `document.activeElement` stays on the outsider button
 * and the expectation fails. That is the regression boundary this
 * probe pins; a tabbable-presence check alone would silently stay
 * green.
 *
 * JSDOM caveat: `.focus()` does not always emit a `focusin` event in
 * jsdom, so we dispatch one explicitly. The trap's listener consumes
 * it identically to the browser path.
 */
export function expectFocusTrapWired(dialog: HTMLElement): void {
    const outsider = document.createElement('button');
    outsider.type = 'button';
    outsider.textContent = 'focus-trap probe';
    document.body.appendChild(outsider);
    try {
        outsider.focus();
        outsider.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(
            dialog.contains(document.activeElement),
            'focus did not return into the dialog — focus-trap-react is not wired',
        ).toBe(true);
    } finally {
        outsider.remove();
    }
}

/**
 * Soft fallback used by row 4 of dialogs that intentionally do NOT
 * wire `<FocusTrap>` — they rely on Escape + visible Close affordances
 * for dismissal. Use this in place of `expectFocusTrapWired` only when
 * the dialog source has no `<FocusTrap>` wrapper; the call site MUST
 * cite the source line that confirms the trap is absent so the
 * weaker contract is auditable. The presence of a focusable control
 * is the minimum a11y floor: a dialog with no tabbable element strands
 * keyboard users.
 */
export function expectFocusableContent(dialog: HTMLElement): void {
    const focusableSelector =
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    expect(
        dialog.querySelector(focusableSelector),
        'dialog has no focusable controls — keyboard users would be stranded',
    ).not.toBeNull();
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
