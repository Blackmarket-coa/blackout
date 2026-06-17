// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { SelfProfileHydrator } from '../../../../src/app/features/profile/SelfProfileHydrator';
import { myProfileAtom } from '../../../../src/app/features/profile/profileAtoms';
import type { MemberProfile } from '../../../../src/app/features/profile/profileTypes';
import { matrixClientAtom } from '../../../../src/app/state/auth';

// Media-auth gate is irrelevant to the fill logic; force a deterministic value.
vi.mock('../../../../src/app/hooks/useMediaAuthentication', () => ({
    useMediaAuthentication: () => false,
}));

const getProfileInfo = vi.fn();
const mxcUrlToHttp = vi.fn((_mxc: string) => 'https://media.example/avatar.png');

const mockClient = {
    getUserId: () => '@real:blackout.example',
    getProfileInfo,
    mxcUrlToHttp,
};

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => mockClient,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renderHydrator = async (store: ReturnType<typeof createStore>) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    store.set(matrixClientAtom, mockClient as never);
    await act(async () => {
        root.render(
            <Provider store={store}>
                <SelfProfileHydrator />
            </Provider>
        );
    });
    // Let the getProfileInfo promise resolve and the follow-up store.set run.
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return () => {
        act(() => root.unmount());
        container.remove();
    };
};

describe('SelfProfileHydrator', () => {
    afterEach(() => {
        getProfileInfo.mockReset();
        mxcUrlToHttp.mockClear();
    });

    it('fills empty display name + avatar from the Matrix account', async () => {
        getProfileInfo.mockResolvedValue({
            displayname: 'Real Name',
            avatar_url: 'mxc://blackout.example/abc',
        });
        const store = createStore();

        const cleanup = await renderHydrator(store);

        const profile = store.get(myProfileAtom);
        expect(profile.userId).toBe('@real:blackout.example');
        expect(profile.displayName).toBe('Real Name');
        expect(profile.avatarUrl).toBe('https://media.example/avatar.png');
        // mxc avatar was converted to an http URL before being stored.
        expect(mxcUrlToHttp).toHaveBeenCalledWith(
            'mxc://blackout.example/abc',
            160,
            160,
            'crop',
            undefined,
            undefined,
            false
        );

        cleanup();
    });

    it('does not overwrite a profile the user already customised', async () => {
        getProfileInfo.mockResolvedValue({
            displayname: 'Matrix Name',
            avatar_url: 'mxc://blackout.example/xyz',
        });
        const store = createStore();
        const existing: MemberProfile = {
            userId: '@real:blackout.example',
            displayName: 'My Chosen Name',
            avatarUrl: 'https://cdn.example/mine.png',
            roleBadges: [],
            mutualSpaces: [],
            profile: {},
        };
        store.set(myProfileAtom, existing);

        const cleanup = await renderHydrator(store);

        const profile = store.get(myProfileAtom);
        expect(profile.displayName).toBe('My Chosen Name');
        expect(profile.avatarUrl).toBe('https://cdn.example/mine.png');
        expect(mxcUrlToHttp).not.toHaveBeenCalled();

        cleanup();
    });

    it('reconciles the userId even when the profile fetch fails', async () => {
        getProfileInfo.mockRejectedValue(new Error('network'));
        const store = createStore();

        const cleanup = await renderHydrator(store);

        expect(store.get(myProfileAtom).userId).toBe('@real:blackout.example');

        cleanup();
    });
});
