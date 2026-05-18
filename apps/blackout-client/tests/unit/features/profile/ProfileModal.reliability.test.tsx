// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ProfileModal } from '../../../../src/app/features/profile/ProfileModal';
import type { MemberProfile } from '../../../../src/app/features/profile/profileTypes';
import {
    renderDialog,
    pressEscape,
    findDialog,
    queryDialog,
    expectFocusTrapWired,
    installListenerLedger,
    captureConsoleErrors,
} from '../../helpers/modalReliability';

const profile: MemberProfile = {
    userId: '@alice:example.org',
    displayName: 'Alice',
    roleBadges: ['admin'],
    mutualSpaces: [],
    profile: {} as MemberProfile['profile'],
};

describe('ProfileModal reliability', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('row 1 — opens with role=dialog, aria-modal, and a labelled name heading', async () => {
        const mounted = await renderDialog(
            <ProfileModal open profile={profile} onClose={() => undefined} />,
        );
        const dialog = findDialog(mounted.container);
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        const labelledBy = dialog.getAttribute('aria-labelledby');
        const label = labelledBy ? document.getElementById(labelledBy) : null;
        expect(label?.textContent).toBe('Alice');
        mounted.unmount();
    });

    it('row 2 — Escape fires onClose exactly once', async () => {
        const onClose = vi.fn();
        const mounted = await renderDialog(
            <ProfileModal open profile={profile} onClose={onClose} />,
        );
        await pressEscape();
        expect(onClose).toHaveBeenCalledTimes(1);
        mounted.unmount();
    });

    it('row 3 — backdrop click fires onClose (overlay owns the dismissal)', async () => {
        const onClose = vi.fn();
        const mounted = await renderDialog(
            <ProfileModal open profile={profile} onClose={onClose} />,
        );
        const dialog = findDialog(mounted.container);
        dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(onClose).toHaveBeenCalled();
        mounted.unmount();
    });

    it('row 4 — focus trap is wired (dialog has focusable elements)', async () => {
        const mounted = await renderDialog(
            <ProfileModal open profile={profile} onClose={() => undefined} />,
        );
        expectFocusTrapWired(findDialog(mounted.container));
        mounted.unmount();
    });

    it('row 5 — closed state renders no dialog and leaks no window listeners', async () => {
        const { ledger, restore } = installListenerLedger();
        try {
            const mounted = await renderDialog(
                <ProfileModal open={false} profile={profile} onClose={() => undefined} />,
            );
            expect(queryDialog(mounted.container)).toBeNull();
            mounted.unmount();
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
        } finally {
            restore();
        }
    });

    it('row 6 — spam open/close 20 cycles leaks no listeners and emits no hard errors', async () => {
        const errors = captureConsoleErrors();
        const { ledger, restore } = installListenerLedger();
        try {
            const onClose = vi.fn();
            const mounted = await renderDialog(
                <ProfileModal open={false} profile={profile} onClose={onClose} />,
            );
            for (let i = 0; i < 20; i += 1) {
                await mounted.rerender(
                    <ProfileModal open profile={profile} onClose={onClose} />,
                );
                await mounted.rerender(
                    <ProfileModal open={false} profile={profile} onClose={onClose} />,
                );
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
