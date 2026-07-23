// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    sendFriendRequest: vi.fn().mockResolvedValue(undefined),
    followUser: vi.fn().mockResolvedValue({ ok: true, following: true, created: true }),
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({ getUserId: () => '@me:server' }),
}));

vi.mock('../../../../src/app/features/profile/useProfileActions', () => ({
    useProfileActions: () => ({ startDm: vi.fn(), block: vi.fn() }),
}));

vi.mock('../../../../src/app/features/friends/useFriends', () => ({
    useFriends: () => ({ isFriend: () => false, isOutgoing: () => false }),
}));

vi.mock('../../../../src/app/features/friends/friendActions', () => ({
    sendFriendRequest: (...args: unknown[]) => mocks.sendFriendRequest(...args),
}));

vi.mock('../../../../src/app/features/profile/profileClient', () => ({
    followUser: (...args: unknown[]) => mocks.followUser(...args),
}));

// Stub the presentational modal: this test is about ConnectedProfileModal's
// action wiring, not the modal's rendering tree.
vi.mock('../../../../src/app/features/profile/ProfileModal', () => ({
    ProfileModal: ({
        profile,
        onAddFriend,
    }: {
        profile: { userId: string };
        onAddFriend?: (userId: string) => void;
    }) => (
        <button
            type="button"
            data-testid="add-friend"
            onClick={() => onAddFriend?.(profile.userId)}
        >
            Add Friend
        </button>
    ),
}));

import { ConnectedProfileModal } from '../../../../src/app/features/profile/ConnectedProfileModal';

const profile = {
    userId: '@friend:server',
    displayName: 'Friend',
    roleBadges: [],
    mutualSpaces: [],
    isFriend: false,
    profile: {},
};

const mountAndAddFriend = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<ConnectedProfileModal profile={profile} onClose={vi.fn()} />);
        await Promise.resolve();
    });
    await act(async () => {
        container
            .querySelector('[data-testid="add-friend"]')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
    });
};

beforeEach(() => {
    mocks.sendFriendRequest.mockClear();
    mocks.followUser.mockClear();
    mocks.followUser.mockResolvedValue({ ok: true, following: true, created: true });
    document.body.innerHTML = '';
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('ConnectedProfileModal add-friend wiring', () => {
    it('sends the friend request and records a follow edge for activity tracking', async () => {
        await mountAndAddFriend();
        expect(mocks.sendFriendRequest).toHaveBeenCalledWith(expect.anything(), '@friend:server');
        expect(mocks.followUser).toHaveBeenCalledWith('@friend:server');
    });

    it('does not surface a follow failure — the friend request stands alone', async () => {
        mocks.followUser.mockRejectedValue(new Error('no blackout token'));
        await expect(mountAndAddFriend()).resolves.toBeUndefined();
        expect(mocks.sendFriendRequest).toHaveBeenCalledTimes(1);
    });
});
