// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/app/features/monetization/marketplace/marketplaceClient', () => ({
    fetchProviders: vi.fn(async () => []),
    fetchListings: vi.fn(async () => []),
}));
vi.mock('../../../src/app/features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => '',
}));

import { AttachProductDialog } from '../../../src/app/components/product-attachment/AttachProductDialog';
import {
    renderDialog,
    pressEscape,
    clickOutside,
    findDialog,
    queryDialog,
    expectFocusTrapWired,
    installListenerLedger,
    captureConsoleErrors,
} from '../helpers/modalReliability';

describe('AttachProductDialog reliability', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('row 1 — opens with role=dialog, aria-modal, and an aria-label', async () => {
        const mounted = await renderDialog(
            <AttachProductDialog open onClose={() => undefined} />,
        );
        const dialog = findDialog(mounted.container);
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-label')).toBe('Attach product');
        mounted.unmount();
    });

    it('row 2 — Escape fires onClose', async () => {
        const onClose = vi.fn();
        const mounted = await renderDialog(<AttachProductDialog open onClose={onClose} />);
        await pressEscape();
        expect(onClose).toHaveBeenCalled();
        mounted.unmount();
    });

    // AttachProductDialog has no onClick on its overlay and passes a
    // null ref to the dismissal hook, so outside-click is intentionally
    // not wired. Escape is the only dismissal path.
    it.skip('row 3 — outside-click is intentionally not wired (Escape only)', async () => {
        void clickOutside;
    });

    it('row 4 — focus trap wiring (dialog has focusable controls)', async () => {
        const mounted = await renderDialog(
            <AttachProductDialog open onClose={() => undefined} />,
        );
        expectFocusTrapWired(findDialog(mounted.container));
        mounted.unmount();
    });

    it('row 5 — closed state renders no dialog and leaks no window listeners', async () => {
        const { ledger, restore } = installListenerLedger();
        try {
            const mounted = await renderDialog(
                <AttachProductDialog open={false} onClose={() => undefined} />,
            );
            expect(queryDialog(mounted.container)).toBeNull();
            mounted.unmount();
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
        } finally {
            restore();
        }
    });

    it('row 6 — spam open/close 20 cycles leaks no listeners', async () => {
        const errors = captureConsoleErrors();
        const { ledger, restore } = installListenerLedger();
        try {
            const onClose = vi.fn();
            const mounted = await renderDialog(
                <AttachProductDialog open={false} onClose={onClose} />,
            );
            for (let i = 0; i < 20; i += 1) {
                await mounted.rerender(<AttachProductDialog open onClose={onClose} />);
                await mounted.rerender(<AttachProductDialog open={false} onClose={onClose} />);
            }
            mounted.unmount();
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
            const hard = errors.errors.filter((e) => !/focus-trap|tabbable/i.test(e));
            expect(hard).toEqual([]);
        } finally {
            restore();
            errors.restore();
        }
    });
});
