// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider as JotaiProvider, createStore } from 'jotai';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const previewInvitationMock = vi.fn();
const redeemInvitationMock = vi.fn();
const ensureBlackoutApiTokenMock = vi.fn();

vi.mock('../../../../src/app/features/invitations/invitationsClient', () => ({
    previewInvitation: (...args: unknown[]) => previewInvitationMock(...args),
    redeemInvitation: (...args: unknown[]) => redeemInvitationMock(...args),
}));

vi.mock('../../../../src/client/blackoutApiSession', () => ({
    ensureBlackoutApiToken: (...args: unknown[]) => ensureBlackoutApiTokenMock(...args),
}));

import { InviteLandingPage } from '../../../../src/app/components/invite-landing/InviteLandingPage';
import {
    authStateAtom,
    matrixClientAtom,
    type AuthState,
} from '../../../../src/app/state/auth';

const liveRoots: ReactDOM.Root[] = [];
let assignMock: ReturnType<typeof vi.fn>;

const setLocation = (pathname: string) => {
    assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { pathname, search: '', hash: '', assign: assignMock },
    });
};

const flush = async () => {
    // Several awaits chain inside the redeem effect (token → redeem → join);
    // drain a handful of microtasks so they all settle.
    for (let i = 0; i < 8; i += 1) {
        await act(async () => {
            await Promise.resolve();
        });
    }
};

const makeSpaceClient = (spaceRoomId: string, onboarded: boolean): unknown => ({
    joinRoom: vi.fn().mockResolvedValue(undefined),
    getRoom: (id: string) =>
        id === spaceRoomId
            ? {
                  isSpaceRoom: () => true,
                  getCanonicalAlias: () => null,
                  getLiveTimeline: () => ({
                      getState: () => ({ getStateEvents: () => undefined }),
                  }),
              }
            : null,
    getAccountData: () => ({
        getContent: () => ({ spaces: onboarded ? { [spaceRoomId]: true } : {} }),
    }),
});

const renderPage = (store: ReturnType<typeof createStore>) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    liveRoots.push(root);
    act(() => {
        root.render(
            <JotaiProvider store={store}>
                <InviteLandingPage />
            </JotaiProvider>,
        );
    });
    return container;
};

const seedStore = (mx: unknown, authState: AuthState = 'logged_in') => {
    const store = createStore();
    store.set(authStateAtom, authState);
    store.set(matrixClientAtom, mx as Parameters<typeof store.set>[1]);
    // roomToParents / mDirect default to empty Map/Set — leave them so we don't
    // trip immer's MapSet plugin (only enabled in the real app entrypoint).
    return store;
};

describe('InviteLandingPage', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        previewInvitationMock.mockReset();
        redeemInvitationMock.mockReset();
        ensureBlackoutApiTokenMock.mockReset();
        ensureBlackoutApiTokenMock.mockResolvedValue('jwt');
        setLocation('/invite/tok123');
    });

    afterEach(() => {
        for (const root of liveRoots.splice(0)) {
            act(() => root.unmount());
        }
    });

    it('redeems, joins, and navigates a new user to full-page onboarding (no hang)', async () => {
        const space = '!space:server';
        previewInvitationMock.mockResolvedValue({
            valid: true,
            invitation: { inviter: { id: 'u1', username: 'alice' }, usesRemaining: 1 },
        });
        redeemInvitationMock.mockResolvedValue({ ok: true, matrixRoomId: space });
        const mx = makeSpaceClient(space, false);

        renderPage(seedStore(mx));
        await flush();

        // Redeem was attempted with the resolved API token, and after join the
        // page navigated — proving it left the "Accepting…" state.
        expect(ensureBlackoutApiTokenMock).toHaveBeenCalled();
        expect(redeemInvitationMock).toHaveBeenCalledWith('tok123', 'jwt', expect.anything());
        expect(assignMock).toHaveBeenCalledTimes(1);
        expect(assignMock.mock.calls[0][0].startsWith('/onboarding/')).toBe(true);
    });

    it('shows the specific reason for a business failure and does not navigate', async () => {
        previewInvitationMock.mockResolvedValue({
            valid: true,
            invitation: { inviter: { id: 'u1', username: 'alice' }, usesRemaining: 1 },
        });
        redeemInvitationMock.mockResolvedValue({ ok: false, reason: 'expired' });
        const mx = makeSpaceClient('!unused:server', false);

        const container = renderPage(seedStore(mx));
        await flush();

        expect(assignMock).not.toHaveBeenCalled();
        expect(container.textContent ?? '').toContain('expired');
    });
});
