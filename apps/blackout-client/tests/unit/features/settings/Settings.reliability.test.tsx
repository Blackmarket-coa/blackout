// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Settings is a content component mounted inside a Folds Overlay that
// owns the ESC + outside-click + focus-trap behaviour. The reliability
// contract Settings itself owns is "the visible close affordance fires
// requestClose on mobile" and "mount/unmount doesn't leak listeners".
// Heavier behaviour (the inner pages, Matrix interactions) is covered
// by their own per-page suites.

vi.mock('../../../../src/app/hooks/useScreenSize', () => ({
    ScreenSize: { Mobile: 0, Tablet: 1, Desktop: 2 },
    useScreenSizeContext: () => 0, // Mobile -> close button renders
}));
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getUserId: () => '@me:example.org',
    }),
}));
vi.mock('../../../../src/app/hooks/useUserProfile', () => ({
    useUserProfile: () => ({ displayName: 'Me', avatarUrl: undefined }),
}));
vi.mock('../../../../src/app/hooks/useMediaAuthentication', () => ({
    useMediaAuthentication: () => false,
}));
vi.mock('../../../../src/app/utils/matrix', async () => {
    const actual = await vi.importActual<typeof import('../../../../src/app/utils/matrix')>(
        '../../../../src/app/utils/matrix',
    );
    return { ...actual, mxcUrlToHttp: () => null };
});

import { Settings } from '../../../../src/app/features/settings/Settings';
import {
    renderDialog,
    installListenerLedger,
    captureConsoleErrors,
} from '../../helpers/modalReliability';

describe('Settings reliability (content-component contract)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('mobile close affordance fires requestClose', async () => {
        const requestClose = vi.fn();
        const mounted = await renderDialog(<Settings requestClose={requestClose} />);
        // The mobile header renders a single IconButton bound to
        // requestClose; clicking it must invoke the parent's close.
        const buttons = mounted.container.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThan(0);
        // The first button is the header close (X) on mobile.
        buttons[0].click();
        expect(requestClose).toHaveBeenCalled();
        mounted.unmount();
    });

    it('mount/unmount cycles leak no window listeners and emit no hard errors', async () => {
        const errors = captureConsoleErrors();
        const { ledger, restore } = installListenerLedger();
        try {
            for (let i = 0; i < 5; i += 1) {
                const mounted = await renderDialog(
                    <Settings requestClose={() => undefined} />,
                );
                mounted.unmount();
            }
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
            const hard = errors.errors.filter(
                (e) => !/focus-trap|tabbable|act\(/i.test(e),
            );
            expect(hard).toEqual([]);
        } finally {
            restore();
            errors.restore();
        }
    });
});
