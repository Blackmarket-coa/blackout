// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    friends: [] as string[],
    outgoing: [] as string[],
    incoming: [] as { userId: string; roomId: string }[],
    acceptFriendRequest: vi.fn().mockResolvedValue(undefined),
    declineFriendRequest: vi.fn().mockResolvedValue(undefined),
    removeFriend: vi.fn().mockResolvedValue(undefined),
    startDirectMessageWith: vi.fn().mockResolvedValue(undefined),
    navigateRoom: vi.fn(),
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({ getUser: (id: string) => ({ displayName: id }) }),
}));

vi.mock('../../../../src/app/hooks/useRoomNavigate', () => ({
    useRoomNavigate: () => ({ navigateRoom: mocks.navigateRoom }),
}));

vi.mock('../../../../src/app/features/friends/useFriends', () => ({
    useFriends: () => ({ friends: mocks.friends, outgoing: mocks.outgoing }),
}));

vi.mock('../../../../src/app/features/friends/useFriendInbox', () => ({
    useFriendInbox: () => ({ incoming: mocks.incoming }),
}));

vi.mock('../../../../src/app/features/friends/friendActions', () => ({
    acceptFriendRequest: (...args: unknown[]) => mocks.acceptFriendRequest(...args),
    declineFriendRequest: (...args: unknown[]) => mocks.declineFriendRequest(...args),
    removeFriend: (...args: unknown[]) => mocks.removeFriend(...args),
    startDirectMessageWith: (...args: unknown[]) => mocks.startDirectMessageWith(...args),
}));

import { FriendsDialog } from '../../../../src/app/features/friends/FriendsDialog';

const mount = async (onClose = vi.fn()) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<FriendsDialog onClose={onClose} />);
        await Promise.resolve();
    });
    return { container, onClose };
};

const click = async (el: Element | null) => {
    await act(async () => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
    });
};

beforeEach(() => {
    mocks.friends = [];
    mocks.outgoing = [];
    mocks.incoming = [];
    mocks.acceptFriendRequest.mockClear();
    mocks.declineFriendRequest.mockClear();
    mocks.removeFriend.mockClear();
    mocks.startDirectMessageWith.mockClear();
    mocks.navigateRoom.mockClear();
    document.body.innerHTML = '';
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('FriendsDialog', () => {
    it('shows an empty-friends hint when there is nothing to display', async () => {
        const { container } = await mount();
        expect(container.querySelector('[data-testid="friend-row"]')).toBeNull();
        expect(container.querySelector('[data-testid="friend-incoming"]')).toBeNull();
        expect(container.textContent).toContain('No friends yet');
    });

    it('renders incoming, friends, and outgoing sections', async () => {
        mocks.incoming = [{ userId: '@req:server', roomId: '!dm:server' }];
        mocks.friends = ['@bob:server'];
        mocks.outgoing = ['@pending:server'];
        const { container } = await mount();

        expect(container.querySelectorAll('[data-testid="friend-incoming"]')).toHaveLength(1);
        expect(container.querySelectorAll('[data-testid="friend-row"]')).toHaveLength(1);
        expect(container.querySelectorAll('[data-testid="friend-outgoing"]')).toHaveLength(1);
    });

    it('accepts and declines an incoming request', async () => {
        mocks.incoming = [{ userId: '@req:server', roomId: '!dm:server' }];
        const { container } = await mount();

        await click(container.querySelector('[data-testid="friend-accept"]'));
        expect(mocks.acceptFriendRequest).toHaveBeenCalledWith(expect.anything(), {
            userId: '@req:server',
            roomId: '!dm:server',
        });

        await click(container.querySelector('[data-testid="friend-decline"]'));
        expect(mocks.declineFriendRequest).toHaveBeenCalledWith(expect.anything(), {
            userId: '@req:server',
            roomId: '!dm:server',
        });
    });

    it('removes a friend', async () => {
        mocks.friends = ['@bob:server'];
        const { container } = await mount();

        await click(container.querySelector('[data-testid="friend-remove"]'));
        expect(mocks.removeFriend).toHaveBeenCalledWith(expect.anything(), '@bob:server');
    });

    it('messages a friend then closes', async () => {
        mocks.friends = ['@bob:server'];
        const { container, onClose } = await mount();

        const messageBtn = container.querySelector('[data-testid="friend-row"] button');
        await click(messageBtn);
        expect(mocks.startDirectMessageWith).toHaveBeenCalledWith(
            expect.anything(),
            mocks.navigateRoom,
            '@bob:server'
        );
        expect(onClose).toHaveBeenCalled();
    });

    it('closes via the overlay backdrop', async () => {
        const { container, onClose } = await mount();
        await click(container.querySelector('[data-testid="friends-dialog"]'));
        expect(onClose).toHaveBeenCalled();
    });
});
