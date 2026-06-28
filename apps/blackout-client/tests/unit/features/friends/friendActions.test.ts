import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';

const mocks = vi.hoisted(() => ({
    getDMRoomFor: vi.fn(),
    addRoomIdToMDirect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/app/utils/matrix', () => ({
    getDMRoomFor: (...args: unknown[]) => mocks.getDMRoomFor(...args),
    addRoomIdToMDirect: (...args: unknown[]) => mocks.addRoomIdToMDirect(...args),
}));

vi.mock('../../../../src/app/components/create-room', () => ({
    createRoomEncryptionState: () => ({ type: 'm.room.encryption' }),
}));

import {
    acceptFriendRequest,
    declineFriendRequest,
    ensureDmRoom,
    removeFriend,
    sendFriendRequest,
    confirmAcceptedFriends,
} from '../../../../src/app/features/friends/friendActions';

interface MxState {
    account?: Record<string, unknown>;
    membership?: string;
}

const makeMx = (state: MxState = {}) => {
    const account: Record<string, unknown> = state.account ?? {};
    const setAccountData = vi.fn(async (type: string, content: Record<string, unknown>) => {
        account[type] = content;
    });
    const mx = {
        getSafeUserId: () => '@me:server',
        createRoom: vi.fn().mockResolvedValue({ room_id: '!new:server' }),
        sendEvent: vi.fn().mockResolvedValue({ event_id: '$e' }),
        joinRoom: vi.fn().mockResolvedValue(undefined),
        leave: vi.fn().mockResolvedValue(undefined),
        getRoom: vi.fn(() => ({ getMyMembership: () => state.membership ?? 'join' })),
        getAccountData: (type: string) =>
            account[type] ? { getContent: () => account[type] } : undefined,
        setAccountData,
    };
    return { mx: mx as unknown as MatrixClient, account, setAccountData };
};

beforeEach(() => {
    mocks.getDMRoomFor.mockReset();
    mocks.addRoomIdToMDirect.mockReset().mockResolvedValue(undefined);
});

describe('ensureDmRoom', () => {
    it('reuses an existing DM', async () => {
        mocks.getDMRoomFor.mockReturnValueOnce({ roomId: '!dm:server' });
        const { mx } = makeMx();
        expect(await ensureDmRoom(mx, '@a:server')).toBe('!dm:server');
        expect(mx.createRoom).not.toHaveBeenCalled();
    });

    it('creates an encrypted direct room and records it in m.direct', async () => {
        mocks.getDMRoomFor.mockReturnValueOnce(undefined);
        const { mx } = makeMx();
        expect(await ensureDmRoom(mx, '@a:server')).toBe('!new:server');
        expect(mx.createRoom).toHaveBeenCalledWith(
            expect.objectContaining({ is_direct: true, invite: ['@a:server'] })
        );
        expect(mocks.addRoomIdToMDirect).toHaveBeenCalledWith(mx, '!new:server', '@a:server');
    });
});

describe('sendFriendRequest', () => {
    it('ensures a DM, sends a request signal, and records outgoing', async () => {
        mocks.getDMRoomFor.mockReturnValueOnce({ roomId: '!dm:server' });
        const { mx, account } = makeMx();

        await sendFriendRequest(mx, '@a:server');

        expect(mx.sendEvent).toHaveBeenCalledWith('!dm:server', 'co.bmc.friend_request', {
            action: 'request',
        });
        expect(account['co.bmc.friends']).toEqual({ friends: [], outgoing: ['@a:server'] });
    });

    it('is a no-op for self', async () => {
        const { mx } = makeMx();
        await sendFriendRequest(mx, '@me:server');
        expect(mx.sendEvent).not.toHaveBeenCalled();
    });
});

describe('acceptFriendRequest', () => {
    it('joins the invite, signals accept, and adds the friend', async () => {
        const { mx, account } = makeMx({
            membership: 'invite',
            account: { 'co.bmc.friends': { friends: [], outgoing: [] } },
        });

        await acceptFriendRequest(mx, { userId: '@a:server', roomId: '!dm:server' });

        expect(mx.joinRoom).toHaveBeenCalledWith('!dm:server');
        expect(mocks.addRoomIdToMDirect).toHaveBeenCalledWith(mx, '!dm:server', '@a:server');
        expect(mx.sendEvent).toHaveBeenCalledWith('!dm:server', 'co.bmc.friend_request', {
            action: 'accept',
        });
        expect(account['co.bmc.friends']).toEqual({ friends: ['@a:server'], outgoing: [] });
    });

    it('does not re-join when already a member', async () => {
        const { mx } = makeMx({ membership: 'join' });
        await acceptFriendRequest(mx, { userId: '@a:server', roomId: '!dm:server' });
        expect(mx.joinRoom).not.toHaveBeenCalled();
    });
});

describe('declineFriendRequest', () => {
    it('leaves the DM and clears outgoing', async () => {
        const { mx, account } = makeMx({
            account: { 'co.bmc.friends': { friends: [], outgoing: ['@a:server'] } },
        });

        await declineFriendRequest(mx, { userId: '@a:server', roomId: '!dm:server' });

        expect(mx.leave).toHaveBeenCalledWith('!dm:server');
        expect(account['co.bmc.friends']).toEqual({ friends: [], outgoing: [] });
    });
});

describe('removeFriend', () => {
    it('drops the user from the friends list', async () => {
        const { mx, account } = makeMx({
            account: { 'co.bmc.friends': { friends: ['@a:server'], outgoing: [] } },
        });
        await removeFriend(mx, '@a:server');
        expect(account['co.bmc.friends']).toEqual({ friends: [], outgoing: [] });
    });
});

describe('confirmAcceptedFriends', () => {
    it('promotes accepted users into friends', async () => {
        const { mx, account } = makeMx({
            account: { 'co.bmc.friends': { friends: [], outgoing: ['@a:server'] } },
        });
        await confirmAcceptedFriends(mx, ['@a:server']);
        expect(account['co.bmc.friends']).toEqual({ friends: ['@a:server'], outgoing: [] });
    });

    it('is a no-op with no accepted users', async () => {
        const { mx, setAccountData } = makeMx();
        await confirmAcceptedFriends(mx, []);
        expect(setAccountData).not.toHaveBeenCalled();
    });
});
