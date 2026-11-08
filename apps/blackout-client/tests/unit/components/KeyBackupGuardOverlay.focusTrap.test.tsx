// @vitest-environment jsdom
//
// `KeyBackupGuardOverlay` keeps keyboard focus inside every panel (S9,
// `docs/security/key-backup-nudge-2026-11-02.md`, fifth review). The overlay
// wraps its panel in `focus-trap-react`, which takes its container from the
// child's ref. `KeyBackupExplanation` (the checking, explanation and offer
// panels) was a plain function component, so React dropped that ref, the trap
// had no container, and Tab could leave the modal for the page behind it.
//
// Unlike the other overlay tests in this repository, this file renders the
// real `focus-trap-react`: the trap is what it tests. jsdom has no layout, and
// `tabbable` (which the trap uses to find the nodes it cycles through) treats a
// node with no client rects as hidden, so `getClientRects` is stubbed to report
// one rect. Nothing else about focus is simulated: Tab and Shift+Tab are
// `keydown` events, which the trap handles at the edges of its container, and
// a focus that lands outside is pulled back by the trap's `focusin` listener.
import React from 'react';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    KeyBackupGuardOverlay,
    type KeyBackupGuardPanel,
    type KeyBackupGuardTexts,
    type KeyBackupSetupGuard,
} from '../../../src/app/components/KeyBackupSetupGuard';
import { createFakeKeyClient, createFakeKeyHomeserver } from '../helpers/fakeKeyHomeserver';
import { bodyText, renderWithClient } from '../helpers/keyBackupRender';
import type { MountedDialog } from '../helpers/modalReliability';

const TEXTS: KeyBackupGuardTexts = {
    checking: 'TEXT checking',
    backup: 'TEXT backup',
    not_verified: 'TEXT not verified',
    check_failed: 'TEXT check failed',
    offer: { setup: 'TEXT offer setup', reset: 'TEXT offer reset' },
};

/** What each panel shows, so a test knows the panel it means is on screen. */
const SHOWN: Record<KeyBackupGuardPanel, string> = {
    checking: TEXTS.checking,
    backup: TEXTS.backup,
    not_verified: TEXTS.not_verified,
    check_failed: TEXTS.check_failed,
    offer_setup: 'TEXT offer setup',
    offer_reset: 'TEXT offer reset',
    setup: 'Setup Device Verification',
    reset: 'Reset Device Verification',
};

const PANELS = Object.keys(SHOWN) as KeyBackupGuardPanel[];

const guardFor = (panel: KeyBackupGuardPanel): KeyBackupSetupGuard => ({
    panel,
    texts: TEXTS,
    open: async () => null,
    proceed: async () => null,
    close: () => undefined,
});

let mounted: MountedDialog | undefined;
let outside: HTMLButtonElement;
let consoleErrors: string[];

beforeEach(() => {
    document.body.innerHTML = '';
    // The page behind the overlay: a button keyboard focus must not reach.
    outside = document.createElement('button');
    outside.type = 'button';
    outside.textContent = 'page behind the overlay';
    document.body.appendChild(outside);
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
        () => [{ width: 1, height: 1 }] as unknown as DOMRectList
    );
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        consoleErrors.push(args.map(String).join(' '));
    });
});

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
});

const render = async (panel: KeyBackupGuardPanel) => {
    const mx = createFakeKeyClient(createFakeKeyHomeserver());
    mounted = await renderWithClient(mx, <KeyBackupGuardOverlay guard={guardFor(panel)} />);
    expect(bodyText()).toContain(SHOWN[panel]);
    return mounted;
};

/** The overlay's tabbable controls, in document order: everything but the page's button. */
const insideTabbables = (): HTMLElement[] =>
    Array.from(
        document.body.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"])'
        )
    ).filter((el) => el !== outside);

const focus = async (el: HTMLElement) => {
    await act(async () => {
        el.focus();
        // jsdom does not always emit `focusin` from `.focus()`; the trap listens for it.
        el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        await Promise.resolve();
    });
};

const pressTab = async (shiftKey = false) => {
    const target = (document.activeElement as HTMLElement | null) ?? document.body;
    await act(async () => {
        target.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
        );
        await Promise.resolve();
    });
};

/** Tab from the last control wraps to the first, Shift+Tab back, and focus outside is pulled in. */
const expectFocusStaysInside = async (panel: KeyBackupGuardPanel) => {
    const inside = insideTabbables();
    expect(inside.length, `${panel}: the panel has controls`).toBeGreaterThan(1);
    const first = inside[0];
    const last = inside[inside.length - 1];

    await focus(last);
    expect(document.activeElement).toBe(last);
    await pressTab();
    expect(document.activeElement, `${panel}: Tab from the last control`).toBe(first);

    await pressTab(true);
    expect(document.activeElement, `${panel}: Shift+Tab from the first control`).toBe(last);

    await focus(outside);
    expect(
        inside.includes(document.activeElement as HTMLElement),
        `${panel}: focus that lands on the page behind is pulled back into the overlay`
    ).toBe(true);
};

describe('KeyBackupGuardOverlay: keyboard focus stays in the overlay', () => {
    for (const panel of PANELS) {
        it(`panel '${panel}'`, async () => {
            await render(panel);
            await expectFocusStaysInside(panel);
            expect(consoleErrors.filter((e) => /cannot be given refs/.test(e))).toEqual([]);
        });
    }

    it('when the panel changes to a flow of another component type, the trap follows it', async () => {
        // checking → setup (the nudge's click), and offer → checking → reset
        // (the chip's "Set up backup" on a trusted cross-signing row): each
        // flow is a new DOM node, which a trap created for the previous one
        // would not contain.
        const mx = createFakeKeyClient(createFakeKeyHomeserver());
        mounted = await renderWithClient(
            mx,
            <KeyBackupGuardOverlay guard={guardFor('checking')} />
        );
        await expectFocusStaysInside('checking');
        await mounted.rerender(<KeyBackupGuardOverlay guard={guardFor('setup')} />);
        expect(bodyText()).toContain(SHOWN.setup);
        await expectFocusStaysInside('setup');

        await mounted.rerender(<KeyBackupGuardOverlay guard={guardFor('offer_reset')} />);
        await expectFocusStaysInside('offer_reset');
        await mounted.rerender(<KeyBackupGuardOverlay guard={guardFor('checking')} />);
        await expectFocusStaysInside('checking');
        await mounted.rerender(<KeyBackupGuardOverlay guard={guardFor('reset')} />);
        expect(bodyText()).toContain(SHOWN.reset);
        await expectFocusStaysInside('reset');
    });
});
