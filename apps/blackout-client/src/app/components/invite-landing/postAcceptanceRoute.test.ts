import { describe, expect, it } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomToParents } from '../../../types/matrix/room';
import { resolvePostAcceptancePath } from './postAcceptanceRoute';
import { ONBOARDING_ACCOUNT_DATA_KEY } from '../../features/welcome/useWelcome';

/**
 * Build a minimal MatrixClient stub covering only the surface
 * `resolvePostAcceptancePath` touches: room space-ness and the onboarding
 * completion account-data read.
 */
const makeMx = (opts: {
    spaceRooms?: Set<string>;
    completedSpaces?: Record<string, boolean>;
}): MatrixClient => {
    const { spaceRooms = new Set(), completedSpaces } = opts;
    return {
        getRoom: (roomId: string) =>
            ({ isSpaceRoom: () => spaceRooms.has(roomId) }) as never,
        getAccountData: (type: string) =>
            type === ONBOARDING_ACCOUNT_DATA_KEY && completedSpaces
                ? { getContent: () => ({ spaces: completedSpaces }) }
                : undefined,
    } as unknown as MatrixClient;
};

const emptyParents: RoomToParents = new Map();

describe('resolvePostAcceptancePath', () => {
    it('returns home when there is no room', () => {
        const mx = makeMx({});
        expect(resolvePostAcceptancePath(mx, emptyParents, undefined)).toBe('/');
    });

    it('prefers the server-resolved canopy over local roomToParents', () => {
        // Local parents are empty (brand-new user, unsynced), so without the
        // server canopy onboarding would be skipped. The server hint fixes it.
        const mx = makeMx({});
        const path = resolvePostAcceptancePath(mx, emptyParents, '!den:srv', {
            canopyId: '!canopy:srv',
        });
        expect(path).toBe(
            `/onboarding/${encodeURIComponent('!canopy:srv')}?room=${encodeURIComponent('!den:srv')}`,
        );
    });

    it('skips onboarding and opens the den when skipOnboarding is set', () => {
        // The room-open path resolves the canopy from local sync (empty here),
        // so it falls back to the no-canopy sentinel — the den still opens.
        const mx = makeMx({});
        const path = resolvePostAcceptancePath(mx, emptyParents, '!den:srv', {
            canopyId: '!canopy:srv',
            skipOnboarding: true,
        });
        expect(path).toBe(`/communities/-/dens/${encodeURIComponent('!den:srv')}`);
    });

    it('opens the den directly when onboarding for that canopy is already complete', () => {
        const mx = makeMx({ completedSpaces: { '!canopy:srv': true } });
        const path = resolvePostAcceptancePath(mx, emptyParents, '!den:srv', {
            canopyId: '!canopy:srv',
        });
        expect(path).toBe(`/communities/-/dens/${encodeURIComponent('!den:srv')}`);
    });

    it('treats a space-room invite as its own canopy for onboarding', () => {
        const mx = makeMx({ spaceRooms: new Set(['!canopy:srv']) });
        const path = resolvePostAcceptancePath(mx, emptyParents, '!canopy:srv');
        expect(path).toBe(
            `/onboarding/${encodeURIComponent('!canopy:srv')}?room=${encodeURIComponent('!canopy:srv')}`,
        );
    });
});
