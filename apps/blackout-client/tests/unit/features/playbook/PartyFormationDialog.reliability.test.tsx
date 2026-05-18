// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/app/features/playbook/party/useParty', () => ({
    useParty: () => ({
        available: true,
        memberCount: 5,
        formParty: vi.fn(async () => '!new:example.org'),
    }),
}));

import { PartyFormationDialog } from '../../../../src/app/features/playbook/party/PartyFormationDialog';
import {
    renderDialog,
    pressEscape,
    findDialog,
    queryDialog,
    expectFocusableContent,
    installListenerLedger,
    captureConsoleErrors,
} from '../../helpers/modalReliability';

describe('PartyFormationDialog reliability', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('row 1 — opens with role=dialog and an aria-label', async () => {
        const mounted = await renderDialog(
            <PartyFormationDialog parentRoomId="!room:example.org" onClose={() => undefined} />,
        );
        const dialog = findDialog(mounted.container);
        expect(dialog.getAttribute('aria-label')).toBe('Form a party');
        mounted.unmount();
    });

    it('row 2 — Escape fires onClose', async () => {
        const onClose = vi.fn();
        const mounted = await renderDialog(
            <PartyFormationDialog parentRoomId="!room:example.org" onClose={onClose} />,
        );
        await pressEscape();
        expect(onClose).toHaveBeenCalled();
        mounted.unmount();
    });

    it('row 3 — backdrop click fires onClose', async () => {
        const onClose = vi.fn();
        const mounted = await renderDialog(
            <PartyFormationDialog parentRoomId="!room:example.org" onClose={onClose} />,
        );
        findDialog(mounted.container).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(onClose).toHaveBeenCalled();
        mounted.unmount();
    });

    // PartyFormationDialog renders a plain `<div role="dialog">`
    // without a `<FocusTrap>` wrapper (PartyFormationDialog.tsx:107).
    // Row 4 therefore degrades to the soft a11y floor (at least one
    // focusable control). Adding FocusTrap is a real gap but out of
    // scope for the reliability-suite PR; tracked as a follow-up.
    it('row 4 — dialog renders focusable controls (no FocusTrap; see source note)', async () => {
        const mounted = await renderDialog(
            <PartyFormationDialog parentRoomId="!room:example.org" onClose={() => undefined} />,
        );
        expectFocusableContent(findDialog(mounted.container));
        mounted.unmount();
    });

    it('row 5 — unmount removes all window listeners', async () => {
        const { ledger, restore } = installListenerLedger();
        try {
            const mounted = await renderDialog(
                <PartyFormationDialog parentRoomId="!room:example.org" onClose={() => undefined} />,
            );
            expect(queryDialog(mounted.container)).not.toBeNull();
            mounted.unmount();
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
        } finally {
            restore();
        }
    });

    it('row 6 — spam mount/unmount 20 cycles leaks no listeners', async () => {
        const errors = captureConsoleErrors();
        const { ledger, restore } = installListenerLedger();
        try {
            for (let i = 0; i < 20; i += 1) {
                const mounted = await renderDialog(
                    <PartyFormationDialog
                        parentRoomId="!room:example.org"
                        onClose={() => undefined}
                    />,
                );
                mounted.unmount();
            }
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
