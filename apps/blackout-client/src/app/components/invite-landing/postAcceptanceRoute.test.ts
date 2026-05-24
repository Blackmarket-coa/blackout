import { describe, expect, it } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomToParents } from '../../../types/matrix/room';
import {
    resolvePostAcceptancePath,
    INVITE_DEN_PARAM,
    INVITE_CANOPY_PARAM,
} from './postAcceptanceRoute';
import { HOME_TOUR_ACCOUNT_DATA_KEY } from '../../features/onboarding/homeTourState';

/**
 * Build a minimal MatrixClient stub covering only the surface
 * `resolvePostAcceptancePath` touches: room space-ness and the Home-tour
 * completion account-data read.
 */
const makeMx = (opts: { spaceRooms?: Set<string>; tourStatus?: string }): MatrixClient => {
    const { spaceRooms = new Set(), tourStatus } = opts;
    return {
        getRoom: (roomId: string) => ({ isSpaceRoom: () => spaceRooms.has(roomId) }) as never,
        getAccountData: (type: string) =>
            type === HOME_TOUR_ACCOUNT_DATA_KEY && tourStatus
                ? { getContent: () => ({ status: tourStatus }) }
                : undefined,
    } as unknown as MatrixClient;
};

const emptyParents: RoomToParents = new Map();

const homePath = (den: string, canopy?: string) => {
    const params = new URLSearchParams();
    params.set(INVITE_DEN_PARAM, den);
    if (canopy) params.set(INVITE_CANOPY_PARAM, canopy);
    return `/?${params.toString()}`;
};

describe('resolvePostAcceptancePath', () => {
    it('returns home when there is no room', () => {
        const mx = makeMx({});
        expect(resolvePostAcceptancePath(mx, emptyParents, undefined)).toBe('/');
    });

    it('sends a brand-new user to Home with the den + canopy for the tour', () => {
        const mx = makeMx({}); // no tour status => not completed => brand-new
        const path = resolvePostAcceptancePath(mx, emptyParents, '!den:srv', {
            canopyId: '!canopy:srv',
        });
        expect(path).toBe(homePath('!den:srv', '!canopy:srv'));
    });

    it('carries just the den when there is no canopy', () => {
        const mx = makeMx({});
        const path = resolvePostAcceptancePath(mx, emptyParents, '!den:srv');
        expect(path).toBe(homePath('!den:srv'));
    });

    it('skips the tour and opens the den when skipOnboarding is set', () => {
        // The room-open path resolves the canopy from local sync (empty here),
        // so it falls back to the no-canopy sentinel — the den still opens.
        const mx = makeMx({});
        const path = resolvePostAcceptancePath(mx, emptyParents, '!den:srv', {
            canopyId: '!canopy:srv',
            skipOnboarding: true,
        });
        expect(path).toBe(`/communities/-/dens/${encodeURIComponent('!den:srv')}`);
    });

    it('opens the den directly when the Home tour is already completed', () => {
        const mx = makeMx({ tourStatus: 'completed' });
        const path = resolvePostAcceptancePath(mx, emptyParents, '!den:srv', {
            canopyId: '!canopy:srv',
        });
        expect(path).toBe(`/communities/-/dens/${encodeURIComponent('!den:srv')}`);
    });

    it('opens the den directly when the Home tour was dismissed', () => {
        const mx = makeMx({ tourStatus: 'dismissed' });
        const path = resolvePostAcceptancePath(mx, emptyParents, '!den:srv');
        expect(path).toBe(`/communities/-/dens/${encodeURIComponent('!den:srv')}`);
    });
});
