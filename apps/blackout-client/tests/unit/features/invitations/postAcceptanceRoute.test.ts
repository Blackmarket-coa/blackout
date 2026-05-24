import { describe, expect, it } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomToParents } from '../../../../src/types/matrix/room';
import {
    resolvePostAcceptancePath,
    INVITE_DEN_PARAM,
} from '../../../../src/app/components/invite-landing/postAcceptanceRoute';
import { HOME_TOUR_ACCOUNT_DATA_KEY } from '../../../../src/app/features/onboarding/homeTourState';

const makeRoom = (isSpace: boolean) =>
    ({
        isSpaceRoom: () => isSpace,
        getCanonicalAlias: () => null,
        getLiveTimeline: () => ({
            getState: () => ({ getStateEvents: () => undefined }),
        }),
    }) as unknown as ReturnType<MatrixClient['getRoom']>;

const makeMx = (opts: {
    rooms?: Record<string, ReturnType<MatrixClient['getRoom']>>;
    /** Home-tour status: omit for a brand-new user, 'completed'/'dismissed' for returning. */
    tourStatus?: string;
}): MatrixClient =>
    ({
        getRoom: (id: string) => opts.rooms?.[id] ?? null,
        getAccountData: (type: string) =>
            type === HOME_TOUR_ACCOUNT_DATA_KEY && opts.tourStatus
                ? { getContent: () => ({ status: opts.tourStatus }) }
                : undefined,
    }) as unknown as MatrixClient;

const noParents: RoomToParents = new Map();

describe('resolvePostAcceptancePath', () => {
    it('sends account-only invites (no room) home', () => {
        const mx = makeMx({});
        expect(resolvePostAcceptancePath(mx, noParents, undefined)).toBe('/');
    });

    it('routes a brand-new user to Home (for the tour) carrying the den', () => {
        const room = '!space:server';
        const mx = makeMx({ rooms: { [room]: makeRoom(true) } });

        const path = resolvePostAcceptancePath(mx, noParents, room);

        expect(path.startsWith('/?')).toBe(true);
        expect(new URLSearchParams(path.slice(2)).get(INVITE_DEN_PARAM)).toBe(room);
    });

    it('sends a returning user (tour completed) into the canonical communities route', () => {
        const room = '!space:server';
        const mx = makeMx({ rooms: { [room]: makeRoom(true) }, tourStatus: 'completed' });

        const path = resolvePostAcceptancePath(mx, noParents, room);

        expect(path.startsWith('/communities/')).toBe(true);
        expect(path).toContain(encodeURIComponent(room));
    });

    it('skips the tour when asked (post-tour navigation into the room)', () => {
        const room = '!space:server';
        const mx = makeMx({ rooms: { [room]: makeRoom(true) } });

        const path = resolvePostAcceptancePath(mx, noParents, room, { skipOnboarding: true });

        expect(path.startsWith('/?')).toBe(false);
        expect(path.startsWith('/communities/')).toBe(true);
    });

    it('opens an orphan room under the no-canopy sentinel for a returning user', () => {
        const room = '!orphan:server';
        const mx = makeMx({ tourStatus: 'dismissed' });

        const path = resolvePostAcceptancePath(mx, noParents, room);

        expect(path.startsWith('/?')).toBe(false);
        expect(path).toContain('/communities/-/dens/');
        expect(path).toContain(encodeURIComponent(room));
    });

    it('routes a den under its parent canopy for a returning user', () => {
        const room = '!den:server';
        const space = '!canopy:server';
        const roomToParents: RoomToParents = new Map([[room, new Set([space])]]);
        const mx = makeMx({
            rooms: { [room]: makeRoom(false), [space]: makeRoom(true) },
            tourStatus: 'completed',
        });

        const path = resolvePostAcceptancePath(mx, roomToParents, room);

        expect(path.startsWith('/communities/')).toBe(true);
        expect(path).toContain(`/dens/${encodeURIComponent(room)}`);
        expect(path).toContain(encodeURIComponent(space));
    });
});
