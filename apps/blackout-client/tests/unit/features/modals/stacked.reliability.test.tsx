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
 * Stacked-overlay reliability — uses the REAL focus-trap-react.
 *
 * What this file pins, and why:
 *
 * 1. Listener cleanup across stacked mounts. Two dialogs registering
 *    `useDismissOnOutsideOrEscape` and focus-trap-react listeners must
 *    each clean up on unmount; a leak here grows the listener set
 *    monotonically across a session.
 *
 * 2. The CURRENT Escape behaviour with two stacked dialogs: BOTH
 *    onClose callbacks fire. focus-trap (v7) registers its
 *    `checkEscapeKey` on `document` once per trap and does not gate
 *    on `state.paused`, so the lower (paused) trap still
 *    `deactivate()`s when Escape is pressed
 *    (focus-trap/index.js:817-825). The shared
 *    `internalTrapStack` (focus-trap/index.js:118,125) pauses the
 *    lower trap for focus management but does not isolate its
 *    Escape handler. Until a fix lands (either
 *    `stopImmediatePropagation` in the `escapeDeactivates` helper, or
 *    upstream pause-gating in focus-trap), the production contract
 *    IS "Escape closes both". Pinning the current behaviour here
 *    means a future fix that changes it lands as a deliberate
 *    update to this test, not as a silent regression elsewhere.
 *
 * 3. After the topmost dialog unmounts, the lower one still owns
 *    Escape — its `useDismissOnOutsideOrEscape` hook fires onClose.
 */

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

    it('row 1 — Escape closes both dialogs (current known gap; see file header)', async () => {
        const onCloseLower = vi.fn();
        const onCloseTop = vi.fn();
        const mounted = await renderDialog(
            <>
                <ProfileModal open profile={profile} onClose={onCloseLower} />
                <HideMessageDialog
                    open
                    onClose={onCloseTop}
                    onEncoded={() => undefined}
                />
            </>,
        );

        expect(mounted.container.querySelectorAll('[role="dialog"]').length).toBe(2);

        await pressEscape();

        // Pinning current behaviour: both traps' checkEscapeKey fire
        // on the same document keydown, so both onClose handlers run.
        // When stacked-Escape isolation lands upstream, flip these
        // expectations: onCloseTop = 1, onCloseLower = 0.
        expect(onCloseTop).toHaveBeenCalled();
        expect(onCloseLower).toHaveBeenCalled();

        mounted.unmount();
    });

    it('row 2 — two stacked dialogs cleanly remove all listeners on unmount', async () => {
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
            // Both hooks must clean up. The ledger only tracks
            // window-level keydown/pointerdown (the hook's registration
            // target); focus-trap-react uses document listeners that
            // are its own concern and unrelated to the leak class we
            // pin here.
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
        } finally {
            restore();
        }
    });

    it('row 3 — unmounting the topmost dialog leaves the lower one Escape-responsive', async () => {
        const onCloseLower = vi.fn();
        const mounted = await renderDialog(
            <>
                <ProfileModal open profile={profile} onClose={onCloseLower} />
                <HideMessageDialog
                    open
                    onClose={() => undefined}
                    onEncoded={() => undefined}
                />
            </>,
        );

        // Drop the topmost dialog; only the lower one remains mounted.
        await mounted.rerender(<ProfileModal open profile={profile} onClose={onCloseLower} />);

        await pressEscape();
        expect(onCloseLower).toHaveBeenCalled();
        mounted.unmount();
    });
});
