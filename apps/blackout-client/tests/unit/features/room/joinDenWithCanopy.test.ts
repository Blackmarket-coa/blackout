import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { joinDenWithCanopy } from '../../../../src/app/features/room/joinDenWithCanopy';

const joinRoom = vi.fn();
const getRoom = vi.fn();

const mx = { joinRoom, getRoom } as unknown as MatrixClient;

const membership = (m?: string) => ({ getMyMembership: () => m });

/** A room stub whose `m.space.parent` state names the given spaces. */
const withParents = (m: string | undefined, ...parentIds: string[]) => ({
    getMyMembership: () => m,
    currentState: {
        getStateEvents: (type: string) =>
            type === 'm.space.parent' ? parentIds.map((id) => ({ getStateKey: () => id })) : [],
    },
});

describe('joinDenWithCanopy', () => {
    beforeEach(() => {
        joinRoom.mockReset();
        joinRoom.mockResolvedValue(undefined);
        getRoom.mockReset();
        getRoom.mockReturnValue(undefined);
    });

    it('joins the canopy before the den', async () => {
        await joinDenWithCanopy(mx, '!den:srv', '!canopy:srv');
        expect(joinRoom.mock.calls.map((c) => c[0])).toEqual(['!canopy:srv', '!den:srv']);
    });

    it('skips the canopy join when already a member', async () => {
        getRoom.mockReturnValue(membership('join'));
        await joinDenWithCanopy(mx, '!den:srv', '!canopy:srv');
        expect(joinRoom.mock.calls.map((c) => c[0])).toEqual(['!den:srv']);
    });

    it.each([['-'], [undefined], [null], ['#alias:srv']])(
        'joins only the den when canopy is not a real room id (%s)',
        async (canopy) => {
            await joinDenWithCanopy(mx, '!den:srv', canopy as string | null | undefined);
            expect(joinRoom.mock.calls.map((c) => c[0])).toEqual(['!den:srv']);
        }
    );

    it('joins only the den when the canopy equals the den', async () => {
        await joinDenWithCanopy(mx, '!den:srv', '!den:srv');
        expect(joinRoom.mock.calls.map((c) => c[0])).toEqual(['!den:srv']);
    });

    it('still joins the den when the canopy join fails (best-effort)', async () => {
        joinRoom.mockRejectedValueOnce(new Error('no invite'));
        await joinDenWithCanopy(mx, '!den:srv', '!canopy:srv');
        expect(joinRoom.mock.calls.map((c) => c[0])).toEqual(['!canopy:srv', '!den:srv']);
    });

    it('propagates a den join failure to the caller', async () => {
        getRoom.mockReturnValue(membership('join'));
        joinRoom.mockRejectedValueOnce(new Error('den join failed'));
        await expect(joinDenWithCanopy(mx, '!den:srv', '!canopy:srv')).rejects.toThrow(
            'den join failed'
        );
    });

    /**
     * The canopy sidebar walks *joined* rooms, so a den nested in a category the
     * user isn't in is joined and reachable by link but renders nowhere under
     * its canopy.
     */
    describe('categories the den lives in', () => {
        it('joins the category after the den', async () => {
            getRoom.mockImplementation((id: string) =>
                id === '!den:srv' ? withParents(undefined, '!topics:srv') : undefined
            );
            await joinDenWithCanopy(mx, '!den:srv', '!canopy:srv');
            expect(joinRoom.mock.calls.map((c) => c[0])).toEqual([
                '!canopy:srv',
                '!den:srv',
                // After, not before: the den's parent state can't be read until
                // we're in it.
                '!topics:srv',
            ]);
        });

        it('does not re-join the canopy it already named as the parent', async () => {
            getRoom.mockImplementation((id: string) =>
                id === '!den:srv' ? withParents(undefined, '!canopy:srv') : undefined
            );
            await joinDenWithCanopy(mx, '!den:srv', '!canopy:srv');
            expect(joinRoom.mock.calls.map((c) => c[0])).toEqual(['!canopy:srv', '!den:srv']);
        });

        it('skips a category it is already a member of', async () => {
            getRoom.mockImplementation((id: string) => {
                if (id === '!den:srv') return withParents(undefined, '!topics:srv');
                return membership('join');
            });
            await joinDenWithCanopy(mx, '!den:srv', '!canopy:srv');
            expect(joinRoom.mock.calls.map((c) => c[0])).toEqual(['!den:srv']);
        });

        it('keeps the den usable when the category join is refused', async () => {
            getRoom.mockImplementation((id: string) =>
                id === '!den:srv' ? withParents(undefined, '!private-category:srv') : undefined
            );
            joinRoom.mockImplementation(async (id: string) => {
                if (id === '!private-category:srv') throw new Error('not invited');
            });
            // A private category is a legitimate refusal; only sidebar
            // placement is lost, so this must not throw.
            await joinDenWithCanopy(mx, '!den:srv', '!canopy:srv');
            expect(joinRoom.mock.calls.map((c) => c[0])).toContain('!den:srv');
        });
    });
});
