// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { HideMessageDialog } from '../../../../src/app/features/steganography';
import {
    renderDialog,
    pressEscape,
    findDialog,
    queryDialog,
    expectFocusTrapWired,
    installListenerLedger,
    captureConsoleErrors,
} from '../../helpers/modalReliability';

describe('HideMessageDialog reliability', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });

    it('row 1 — opens with role=dialog, aria-modal, and an aria-labelledby pointing to visible text', async () => {
        const mounted = await renderDialog(
            <HideMessageDialog open onClose={() => undefined} onEncoded={() => undefined} />,
        );
        const dialog = findDialog(mounted.container);
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        const label = labelledBy ? document.getElementById(labelledBy) : null;
        expect(label?.textContent ?? '').toMatch(/Steganography/);
        mounted.unmount();
    });

    it('row 2 — Escape fires onClose exactly once', async () => {
        const onClose = vi.fn();
        const mounted = await renderDialog(
            <HideMessageDialog open onClose={onClose} onEncoded={() => undefined} />,
        );
        await pressEscape();
        expect(onClose).toHaveBeenCalledTimes(1);
        mounted.unmount();
    });

    it('row 3 — backdrop click fires onClose (overlay div owns the dismissal)', async () => {
        const onClose = vi.fn();
        const mounted = await renderDialog(
            <HideMessageDialog open onClose={onClose} onEncoded={() => undefined} />,
        );
        // The HideMessageDialog uses an onClick on the role=dialog overlay
        // (with stopPropagation on the inner panel). Clicking the dialog
        // element directly simulates a backdrop tap.
        const dialog = findDialog(mounted.container);
        dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(onClose).toHaveBeenCalled();
        mounted.unmount();
    });

    it('row 4 — focus trap is wired (dialog has focusable elements)', async () => {
        const mounted = await renderDialog(
            <HideMessageDialog open onClose={() => undefined} onEncoded={() => undefined} />,
        );
        expectFocusTrapWired(findDialog(mounted.container));
        mounted.unmount();
    });

    it('row 5 — closed state renders no dialog and leaks no window listeners', async () => {
        const { ledger, restore } = installListenerLedger();
        try {
            const mounted = await renderDialog(
                <HideMessageDialog open={false} onClose={() => undefined} onEncoded={() => undefined} />,
            );
            expect(queryDialog(mounted.container)).toBeNull();
            mounted.unmount();
            // open=false means useDismissOnOutsideOrEscape short-circuits;
            // no keydown / pointerdown listeners should have been added.
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
        } finally {
            restore();
        }
    });

    it('row 6 — spam open/close 20 cycles leaves no leaked listeners and no console errors', async () => {
        const errors = captureConsoleErrors();
        const { ledger, restore } = installListenerLedger();
        try {
            const onClose = vi.fn();
            const mounted = await renderDialog(
                <HideMessageDialog open={false} onClose={onClose} onEncoded={() => undefined} />,
            );
            for (let i = 0; i < 20; i += 1) {
                await mounted.rerender(
                    <HideMessageDialog open onClose={onClose} onEncoded={() => undefined} />,
                );
                await mounted.rerender(
                    <HideMessageDialog open={false} onClose={onClose} onEncoded={() => undefined} />,
                );
            }
            mounted.unmount();
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
            // focus-trap-react logs benign warnings under jsdom; only
            // fail on hard errors (React/component crashes).
            const hard = errors.errors.filter((e) => !/focus-trap|tabbable/i.test(e));
            expect(hard).toEqual([]);
        } finally {
            restore();
            errors.restore();
        }
    });
});
