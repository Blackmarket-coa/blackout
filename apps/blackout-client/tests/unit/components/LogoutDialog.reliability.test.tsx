// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getRooms: () => [],
        getCrypto: () => undefined,
        getSafeUserId: () => '@me:example.org',
        getDeviceId: () => 'DEV',
    }),
}));
vi.mock('../../../src/app/hooks/useCrossSigning', () => ({
    useCrossSigningActive: () => false,
}));
vi.mock('../../../src/app/hooks/useDeviceVerificationStatus', () => ({
    VerificationStatus: { Unverified: 'unverified', Verified: 'verified' },
    useDeviceVerificationStatus: () => 'verified',
}));
vi.mock('../../../src/client/initMatrix', () => ({
    logoutClient: vi.fn(async () => undefined),
}));

import { LogoutDialog } from '../../../src/app/components/LogoutDialog';
import {
    renderDialog,
    installListenerLedger,
    captureConsoleErrors,
} from '../helpers/modalReliability';

describe('LogoutDialog reliability', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    // LogoutDialog is a content component — it is mounted inside a
    // parent Folds Overlay that owns the open/close lifecycle and the
    // overlay's own ESC / backdrop / focus-trap behaviour. The
    // reliability contract LogoutDialog itself owns is:
    //   - Cancel button is present and wired to handleClose
    //   - mount/unmount cycles leak no window listeners
    // Parent-overlay reliability (ESC, outside-click) is covered by
    // the Folds Overlay tests upstream.

    it('renders a Logout heading and a Cancel button bound to handleClose', async () => {
        const handleClose = vi.fn();
        const mounted = await renderDialog(<LogoutDialog handleClose={handleClose} />);
        const heading = Array.from(mounted.container.querySelectorAll('*')).find((el) =>
            el.textContent?.trim() === 'Logout',
        );
        expect(heading).toBeTruthy();
        const cancel = Array.from(mounted.container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Cancel'),
        );
        expect(cancel).toBeTruthy();
        cancel!.click();
        expect(handleClose).toHaveBeenCalledTimes(1);
        mounted.unmount();
    });

    it('mount/unmount cycles leak no window listeners and emit no hard errors', async () => {
        const errors = captureConsoleErrors();
        const { ledger, restore } = installListenerLedger();
        try {
            for (let i = 0; i < 20; i += 1) {
                const mounted = await renderDialog(<LogoutDialog handleClose={() => undefined} />);
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
