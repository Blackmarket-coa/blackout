// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'matrix-js-sdk';

// Stub ConnectedProfileModal so the test is about the panel's open-on-click
// wiring, not the matrix-client / friends / profile-action tree the real
// connected modal pulls in.
vi.mock('../../../../src/app/features/profile/ConnectedProfileModal', () => ({
    ConnectedProfileModal: ({ profile }: { profile: { userId: string; avatarUrl?: string } }) => (
        <div data-testid="profile-modal" data-avatar={profile.avatarUrl ?? ''}>
            {profile.userId}
        </div>
    ),
}));

// The Coalitions dialog only renders when opened; stub it so its API hooks
// never run in this isolated panel render.
vi.mock('../../../../src/app/features/coalitions/CoalitionsDialog', () => ({
    CoalitionsDialog: ({ onClose }: { onClose: () => void }) => (
        <div data-testid="coalitions-dialog">
            <button type="button" data-testid="coalitions-close" onClick={onClose}>
                close
            </button>
        </div>
    ),
}));

vi.mock('../../../../src/app/hooks/useUserPresence', () => ({
    Presence: { Online: 'online', Unavailable: 'unavailable', Offline: 'offline' },
    useUserPresence: () => ({ presence: 'online' }),
}));

vi.mock('../../../../src/app/hooks/usePowerLevels', () => ({
    usePowerLevels: () => ({}),
}));

vi.mock('../../../../src/app/hooks/usePowerLevelTags', () => ({
    usePowerLevelTags: () => [],
    getPowerLevelTag: () => ({ name: 'Member' }),
}));

vi.mock('../../../../src/app/features/right-panel/rightPanelUtils', () => ({
    groupMembersByPresence: (members: unknown[]) => ({ online: members, away: [], offline: [] }),
}));

// Profile actions use useRoomNavigate (react-router) + account data, neither of
// which this isolated render provides; stub to keep the test about row → modal.
vi.mock('../../../../src/app/features/profile/useProfileActions', () => ({
    useProfileActions: () => ({ startDm: vi.fn(), block: vi.fn() }),
}));

import { CanopyMemberPanel } from '../../../../src/app/features/canopy/CanopyMemberPanel';

// The avatar address in the member's membership event: free text.
let avatarInMembership: string | undefined;
const member = {
    userId: '@alice:server',
    name: 'Alice',
    powerLevel: 0,
    getMxcAvatarUrl: () => avatarInMembership,
};

const room = {
    getJoinedMembers: () => [member],
    client: { getHomeserverUrl: () => 'https://hs.example' },
} as unknown as Room;

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<CanopyMemberPanel room={room} />);
        await Promise.resolve();
    });
    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
    avatarInMembership = undefined;
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('CanopyMemberPanel', () => {
    it('renders each member as a clickable button with a presence dot', async () => {
        const { container } = await mount();
        const row = container.querySelector('[data-testid="canopy-member-row"]');
        expect(row).not.toBeNull();
        expect(row?.tagName).toBe('BUTTON');
        expect(container.querySelector('[data-testid="canopy-member-presence"]')).not.toBeNull();
    });

    it('opens the profile modal for the clicked member', async () => {
        const { container } = await mount();
        expect(container.querySelector('[data-testid="profile-modal"]')).toBeNull();

        const row = container.querySelector<HTMLButtonElement>('[data-testid="canopy-member-row"]');
        await act(async () => {
            row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        const modal = container.querySelector('[data-testid="profile-modal"]');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toBe('@alice:server');
    });

    // The profile card shows the avatar it is handed. A member can put any
    // address in their membership event; only one the homeserver holds is
    // passed on, so opening a profile does not send the reader to a server of
    // that member's choosing.
    it.each([
        ['https://tracker.example/pixel.png', ''],
        ['//tracker.example/pixel.png', ''],
        [
            'mxc://server/abc',
            'https://hs.example/_matrix/media/v3/thumbnail/server/abc?width=256&height=256&method=scale',
        ],
    ])('hands the profile card an avatar of %s as %j', async (avatar, expected) => {
        avatarInMembership = avatar;
        const { container } = await mount();

        const row = container.querySelector<HTMLButtonElement>('[data-testid="canopy-member-row"]');
        await act(async () => {
            row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(
            container.querySelector('[data-testid="profile-modal"]')?.getAttribute('data-avatar')
        ).toBe(expected);
    });

    it('opens and closes the coalitions dialog from the header button', async () => {
        const { container } = await mount();
        expect(container.querySelector('[data-testid="coalitions-dialog"]')).toBeNull();

        const open = container.querySelector<HTMLButtonElement>(
            '[data-testid="canopy-coalitions-open"]'
        );
        await act(async () => {
            open?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(container.querySelector('[data-testid="coalitions-dialog"]')).not.toBeNull();

        const close = container.querySelector<HTMLButtonElement>(
            '[data-testid="coalitions-close"]'
        );
        await act(async () => {
            close?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(container.querySelector('[data-testid="coalitions-dialog"]')).toBeNull();
    });
});
