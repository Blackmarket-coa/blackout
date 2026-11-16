// @vitest-environment jsdom
//
// The profile card, the profile window, the profile page and the editor show
// an avatar and a banner from addresses kept in the profile, and the profile
// API stores any URL for them. Until 2026-11-16 the stored address went to an
// <img> as it was: a profile whose owner pointed it at their own server made
// the device of everyone who opened that profile fetch from it, which told
// that server who looked, from which network address, and when.
//
// These tests give each of the four a profile like that and look at everything
// the browser was handed. docs/security/trust-claims-2026-11-16.md, T10.
import React, { type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatrixClientProvider } from '../../../../src/app/hooks/useMatrixClient';
import { MiniProfile } from '../../../../src/app/features/profile/MiniProfile';
import { ProfileModal } from '../../../../src/app/features/profile/ProfileModal';
import { ProfilePage } from '../../../../src/app/features/profile/ProfilePage';
import { ProfileEditor } from '../../../../src/app/features/profile/ProfileEditor';
import { myProfileAtom } from '../../../../src/app/features/profile/profileAtoms';
import type { MemberProfile } from '../../../../src/app/features/profile/profileTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The page's data panels fetch from the API; none of them shows the avatar or
// the banner, so they are left out.
vi.mock('../../../../src/app/features/profile/ProfileWall', () => ({ default: () => null }));
vi.mock('../../../../src/app/features/profile/ProfileReputation', () => ({
    default: () => null,
}));
vi.mock('../../../../src/app/features/profile/ProfileRings', () => ({ default: () => null }));
vi.mock('../../../../src/app/features/profile/ProfileCoalitions', () => ({
    default: () => null,
}));
// The editor publishes the saved status to Matrix presence, and asks the API
// which palettes are unlocked.
vi.mock('../../../../src/app/features/profile/customStatus', () => ({
    syncStatusToPresence: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../src/app/features/profile/profileClient', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    fetchProfilePalettes: vi.fn().mockResolvedValue({ stats: {}, palettes: [] }),
}));
vi.mock('../../../../src/app/hooks/useMediaAuthentication', () => ({
    useMediaAuthentication: () => false,
}));

const HS = 'https://hs.example';
const client = {
    getUserId: () => '@owner:hs.example',
    getHomeserverUrl: () => HS,
};

/** Addresses on a server the profile's owner runs. */
const TRACKING_AVATAR = 'https://tracker.example/avatar.gif?profile=owner';
const TRACKING_BANNER = 'https://tracker.example/banner.gif?profile=owner';

/** What the editor stores for a picture it uploaded. */
const HS_AVATAR = `${HS}/_matrix/media/v3/thumbnail/hs.example/avatar1?width=160&height=160&method=crop`;
const HS_BANNER = `${HS}/_matrix/media/v3/download/hs.example/banner1`;

const makeProfile = (avatarUrl?: string, banner?: string): MemberProfile => ({
    userId: '@owner:hs.example',
    displayName: 'Owner',
    avatarUrl,
    roleBadges: [],
    mutualSpaces: [],
    profile: banner ? { banner } : {},
});

let container: HTMLDivElement;
let root: ReactDOM.Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
    window.localStorage.clear();
});

const mount = async (node: ReactNode, store = createStore()) => {
    await act(async () => {
        root.render(
            <Provider store={store}>
                <MatrixClientProvider value={client as never}>{node}</MatrixClientProvider>
            </Provider>
        );
    });
};

/** Every address the page gave the browser to fetch. */
const loaded = (): string[] =>
    Array.from(document.body.querySelectorAll('img, video, audio, source, iframe, link'))
        .map((el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '')
        .filter(Boolean);

const SURFACES: Array<[string, (profile: MemberProfile) => ReactNode]> = [
    ['the profile card', (profile) => <MiniProfile profile={profile} />],
    [
        'the profile window',
        (profile) => <ProfileModal open profile={profile} onClose={() => undefined} />,
    ],
    ['the profile page', (profile) => <ProfilePage profile={profile} viewerId="@me:hs.example" />],
];

describe.each(SURFACES)("%s: another person's profile", (_name, render) => {
    it('does not load an avatar or a banner from a server the owner chose', async () => {
        await mount(render(makeProfile(TRACKING_AVATAR, TRACKING_BANNER)));

        expect(loaded()).toEqual([]);
        // Not as an image, not as a background, not anywhere.
        expect(document.body.innerHTML).not.toContain('tracker.example');
        // The card still stands: the name's initial in place of the picture.
        expect(document.body.textContent).toContain('O');
        expect(document.body.textContent).toContain('Owner');
    });

    it('loads both when they are media on this homeserver', async () => {
        await mount(render(makeProfile(HS_AVATAR, HS_BANNER)));

        expect(loaded().sort()).toEqual([HS_BANNER, HS_AVATAR].sort());
    });

    it('loads both from mxc:// addresses, through this homeserver', async () => {
        await mount(render(makeProfile('mxc://hs.example/avatar1', 'mxc://elsewhere.example/b1')));

        expect(loaded().sort()).toEqual(
            [
                `${HS}/_matrix/media/v3/download/elsewhere.example/b1`,
                `${HS}/_matrix/media/v3/download/hs.example/avatar1`,
            ].sort()
        );
    });

    it('judges the avatar and the banner separately', async () => {
        await mount(render(makeProfile(HS_AVATAR, TRACKING_BANNER)));
        expect(loaded()).toEqual([HS_AVATAR]);
    });

    it('judges the banner and the avatar separately', async () => {
        await mount(render(makeProfile(TRACKING_AVATAR, HS_BANNER)));
        expect(loaded()).toEqual([HS_BANNER]);
    });
});

describe('the profile card with no client signed in', () => {
    it('loads nothing rather than guess a homeserver', async () => {
        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <MiniProfile profile={makeProfile(HS_AVATAR, 'mxc://hs.example/b1')} />
                </Provider>
            );
        });
        expect(loaded()).toEqual([]);
    });
});

describe('the profile editor', () => {
    const mountEditor = async (avatarUrl?: string, banner?: string) => {
        const store = createStore();
        store.set(myProfileAtom, makeProfile(avatarUrl, banner));
        await mount(<ProfileEditor saveProfile={vi.fn().mockResolvedValue({})} />, store);
    };

    it('shows the pictures it uploaded', async () => {
        await mountEditor(HS_AVATAR, HS_BANNER);
        expect(loaded().sort()).toEqual([HS_BANNER, HS_AVATAR].sort());
    });

    it('shows the local preview of a picture that was just picked', async () => {
        const avatarPreview = 'blob:https://app.example/11111111-1111-4111-8111-111111111111';
        const bannerPreview = 'blob:https://app.example/22222222-2222-4222-8222-222222222222';
        await mountEditor(avatarPreview, bannerPreview);
        expect(loaded().sort()).toEqual([avatarPreview, bannerPreview].sort());
    });

    it('shows an mxc:// address it kept when the upload gave no web address', async () => {
        await mountEditor('mxc://hs.example/avatar1', 'mxc://hs.example/banner1');
        expect(loaded().sort()).toEqual(
            [
                `${HS}/_matrix/media/v3/download/hs.example/avatar1`,
                `${HS}/_matrix/media/v3/download/hs.example/banner1`,
            ].sort()
        );
    });

    it('does not show, as if others would see it, a picture kept at another address', async () => {
        await mountEditor(TRACKING_AVATAR, TRACKING_BANNER);
        expect(loaded()).toEqual([]);
        expect(document.body.innerHTML).not.toContain('tracker.example');
    });
});
