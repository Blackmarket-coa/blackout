// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createStore } from 'jotai';

vi.mock('../../../../src/app/features/notifications/components/NotificationsDrawer', () => ({
    NotificationsDrawer: () => <div data-testid="notifications-drawer-stub" />,
}));

import { NotificationsBottomSheet } from '../../../../src/app/features/notifications/components/NotificationsBottomSheet';
import { rightPanelAtom } from '../../../../src/app/state/navigation';
import {
    renderDialog,
    pressEscape,
    findDialog,
    queryDialog,
    installListenerLedger,
    captureConsoleErrors,
} from '../../helpers/modalReliability';

const openStore = () => {
    const store = createStore();
    store.set(rightPanelAtom, 'notifications');
    return store;
};

describe('NotificationsBottomSheet reliability', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('row 1 — opens with role=dialog and an aria-label when panel atom is "notifications"', async () => {
        const mounted = await renderDialog(
            <NotificationsBottomSheet roomId="!room:example.org" />,
            { store: openStore() },
        );
        const dialog = findDialog(mounted.container);
        expect(dialog.getAttribute('aria-label')).toBe('Notifications');
        mounted.unmount();
    });

    it('row 2 — Escape closes the sheet (clears panel atom)', async () => {
        const store = openStore();
        const mounted = await renderDialog(
            <NotificationsBottomSheet roomId="!room:example.org" />,
            { store },
        );
        await pressEscape();
        expect(store.get(rightPanelAtom)).toBeNull();
        // Sheet should unmount itself once `open` is false.
        expect(queryDialog(mounted.container)).toBeNull();
        mounted.unmount();
    });

    it('row 3 — backdrop click closes the sheet', async () => {
        const store = openStore();
        const mounted = await renderDialog(
            <NotificationsBottomSheet roomId="!room:example.org" />,
            { store },
        );
        findDialog(mounted.container).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(store.get(rightPanelAtom)).toBeNull();
        mounted.unmount();
    });

    // Row 4 (focus trap) does not apply: NotificationsBottomSheet uses
    // no FocusTrap — it's a mobile bottom-sheet whose dismissal is
    // Escape + backdrop tap + the visible Close button. Row 4 instead
    // verifies the Close button is present and bound.
    it('row 4 — close button is present and clears the panel atom', async () => {
        const store = openStore();
        const mounted = await renderDialog(
            <NotificationsBottomSheet roomId="!room:example.org" />,
            { store },
        );
        const close = mounted.container.querySelector(
            '[data-testid="notifications-bottom-sheet-close"]',
        ) as HTMLButtonElement | null;
        expect(close).not.toBeNull();
        close!.click();
        expect(store.get(rightPanelAtom)).toBeNull();
        mounted.unmount();
    });

    it('row 5 — closed state (atom unset) renders nothing and leaks no listeners', async () => {
        const { ledger, restore } = installListenerLedger();
        try {
            const mounted = await renderDialog(
                <NotificationsBottomSheet roomId="!room:example.org" />,
                { store: createStore() },
            );
            expect(queryDialog(mounted.container)).toBeNull();
            mounted.unmount();
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
        } finally {
            restore();
        }
    });

    it('row 6 — spam toggle 20 cycles leaks no listeners', async () => {
        const errors = captureConsoleErrors();
        const { ledger, restore } = installListenerLedger();
        try {
            const store = createStore();
            const mounted = await renderDialog(
                <NotificationsBottomSheet roomId="!room:example.org" />,
                { store },
            );
            for (let i = 0; i < 20; i += 1) {
                await act(async () => {
                    store.set(rightPanelAtom, 'notifications');
                    await Promise.resolve();
                });
                await act(async () => {
                    store.set(rightPanelAtom, null);
                    await Promise.resolve();
                });
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
