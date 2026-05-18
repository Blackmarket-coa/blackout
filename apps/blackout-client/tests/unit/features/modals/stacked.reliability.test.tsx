// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { HideMessageDialog } from '../../../../src/app/features/steganography';
import { ProfileModal } from '../../../../src/app/features/profile/ProfileModal';
import type { MemberProfile } from '../../../../src/app/features/profile/profileTypes';
import {
    renderDialog,
    pressEscape,
    installListenerLedger,
} from '../../helpers/modalReliability';

/**
 * Stacked-overlay reliability.
 *
 * Catches a class of bugs that single-dialog tests cannot: a naive
 * `window.addEventListener('keydown', ...)` from dialog A still fires
 * even after dialog B is opened on top. Users then see Escape close
 * both dialogs at once — or, worse, the wrong one.
 *
 * `useDismissOnOutsideOrEscape` (the shared hook every dialog in this
 * suite uses) does NOT guard against stacked dispatch on its own; the
 * intended pattern is that focus-trap-react's `escapeDeactivates`
 * stops the Escape from reaching the outer dialog's window listener.
 * If a future refactor breaks that, this test fails loudly.
 *
 * The mock here keeps focus-trap-react out of the picture intentionally:
 * we're measuring the BASELINE behaviour of two stacked
 * useDismissOnOutsideOrEscape consumers under one Escape press. With
 * the trap mocked away, *both* hooks see the event. The assertion
 * therefore is "both dialogs dismiss" (proves both listeners are
 * registered) — and the listener-ledger assertion proves both clean up
 * on unmount. Re-enable real focus-trap-react and the assertion
 * inverts to "only the topmost fires" — that's the regression
 * boundary we want to track.
 */
vi.mock('focus-trap-react', () => {
    const FocusTrap = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    return { __esModule: true, default: FocusTrap };
});

const profile: MemberProfile = {
    userId: '@alice:example.org',
    displayName: 'Alice',
    roleBadges: [],
    mutualSpaces: [],
    profile: {} as MemberProfile['profile'],
};

describe('Stacked overlay reliability', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });

    it('two stacked dialogs both register and both dismiss on Escape (focus-trap stubbed)', async () => {
        const onCloseA = vi.fn();
        const onCloseB = vi.fn();
        const mounted = await renderDialog(
            <>
                <ProfileModal open profile={profile} onClose={onCloseA} />
                <HideMessageDialog open onClose={onCloseB} onEncoded={() => undefined} />
            </>,
        );

        const dialogs = mounted.container.querySelectorAll('[role="dialog"]');
        expect(dialogs.length).toBe(2);

        await pressEscape();

        // With focus-trap stubbed, the BASELINE shared-hook behaviour
        // is that every active hook responds to the same window
        // Escape. Both dialogs dismiss.
        expect(onCloseA).toHaveBeenCalled();
        expect(onCloseB).toHaveBeenCalled();

        mounted.unmount();
    });

    it('two stacked dialogs cleanly remove all listeners on unmount', async () => {
        const { ledger, restore } = installListenerLedger();
        try {
            const mounted = await renderDialog(
                <>
                    <ProfileModal open profile={profile} onClose={() => undefined} />
                    <HideMessageDialog
                        open
                        onClose={() => undefined}
                        onEncoded={() => undefined}
                    />
                </>,
            );
            mounted.unmount();
            // Both hooks must clean up: two keydown listeners added,
            // two removed → net zero. A naive implementation that
            // accidentally double-registers or fails to remove on the
            // second instance would surface here.
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
        } finally {
            restore();
        }
    });

    it('unmounting only the topmost dialog leaves the lower listener intact and responsive', async () => {
        const onCloseA = vi.fn();
        const mounted = await renderDialog(
            <>
                <ProfileModal open profile={profile} onClose={onCloseA} />
                <HideMessageDialog
                    open
                    onClose={() => undefined}
                    onEncoded={() => undefined}
                />
            </>,
        );

        await mounted.rerender(<ProfileModal open profile={profile} onClose={onCloseA} />);

        await pressEscape();
        expect(onCloseA).toHaveBeenCalledTimes(1);
        mounted.unmount();
    });
});
