import { describe, expect, it, vi } from 'vitest';
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
    blockUser,
    startDirectMessage,
} from '../../../../src/app/features/profile/useProfileActions';

const makeMx = (overrides: Partial<MatrixClient> = {}) =>
    ({
        getSafeUserId: () => '@me:server',
        createRoom: vi.fn().mockResolvedValue({ room_id: '!new:server' }),
        setIgnoredUsers: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    } as unknown as MatrixClient);

describe('startDirectMessage', () => {
    it('reuses an existing DM without creating a room', async () => {
        mocks.getDMRoomFor.mockReturnValueOnce({ roomId: '!dm:server' });
        const navigateRoom = vi.fn();
        const mx = makeMx();

        await startDirectMessage(mx, navigateRoom, '@alice:server');

        expect(navigateRoom).toHaveBeenCalledWith('!dm:server');
        expect(mx.createRoom).not.toHaveBeenCalled();
    });

    it('creates an encrypted direct room and records it in m.direct', async () => {
        mocks.getDMRoomFor.mockReturnValueOnce(undefined);
        const navigateRoom = vi.fn();
        const mx = makeMx();

        await startDirectMessage(mx, navigateRoom, '@alice:server');

        expect(mx.createRoom).toHaveBeenCalledWith(
            expect.objectContaining({ is_direct: true, invite: ['@alice:server'] })
        );
        expect(mocks.addRoomIdToMDirect).toHaveBeenCalledWith(mx, '!new:server', '@alice:server');
        expect(navigateRoom).toHaveBeenCalledWith('!new:server');
    });

    it('is a no-op for the current user', async () => {
        const navigateRoom = vi.fn();
        const mx = makeMx();

        await startDirectMessage(mx, navigateRoom, '@me:server');

        expect(navigateRoom).not.toHaveBeenCalled();
        expect(mx.createRoom).not.toHaveBeenCalled();
    });
});

describe('blockUser', () => {
    it('appends the user to the ignored list', async () => {
        const mx = makeMx();
        await blockUser(mx, ['@existing:server'], '@alice:server');
        expect(mx.setIgnoredUsers).toHaveBeenCalledWith(['@existing:server', '@alice:server']);
    });

    it('is idempotent when already ignored and a no-op for self', async () => {
        const mx = makeMx();
        await blockUser(mx, ['@alice:server'], '@alice:server');
        await blockUser(mx, [], '@me:server');
        expect(mx.setIgnoredUsers).not.toHaveBeenCalled();
    });
});
