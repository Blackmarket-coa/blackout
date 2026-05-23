import { describe, expect, it } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomToParents } from '../../../../src/types/matrix/room';
import { resolvePostAcceptancePath } from '../../../../src/app/components/invite-landing/postAcceptanceRoute';

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
    completedSpaces?: Record<string, boolean>;
}): MatrixClient =>
    ({
        getRoom: (id: string) => opts.rooms?.[id] ?? null,
        getAccountData: () => ({
            getContent: () => ({ spaces: opts.completedSpaces ?? {} }),
        }),
    }) as unknown as MatrixClient;

const noParents: RoomToParents = new Map();
const noDirects = new Set<string>();

describe('resolvePostAcceptancePath', () => {
    it('sends account-only invites (no room) home', () => {
        const mx = makeMx({});
        expect(resolvePostAcceptancePath(mx, noParents, noDirects, undefined)).toBe('/');
    });

    it('routes a brand-new user (space not onboarded) to full-page onboarding carrying the room', () => {
        const room = '!space:server';
        const mx = makeMx({ rooms: { [room]: makeRoom(true) }, completedSpaces: {} });

        const path = resolvePostAcceptancePath(mx, noParents, noDirects, room);

        expect(path.startsWith('/onboarding/')).toBe(true);
        expect(path).toContain(`room=${encodeURIComponent(room)}`);
    });

    it('sends a returning user (space already onboarded) straight into the room', () => {
        const room = '!space:server';
        const mx = makeMx({ rooms: { [room]: makeRoom(true) }, completedSpaces: { [room]: true } });

        const path = resolvePostAcceptancePath(mx, noParents, noDirects, room);

        expect(path.startsWith('/onboarding/')).toBe(false);
        expect(path).toContain(encodeURIComponent(room));
    });

    it('skips onboarding when asked (post-onboarding navigation into the room)', () => {
        const room = '!space:server';
        // Not onboarded, but skipOnboarding short-circuits the check.
        const mx = makeMx({ rooms: { [room]: makeRoom(true) }, completedSpaces: {} });

        const path = resolvePostAcceptancePath(mx, noParents, noDirects, room, {
            skipOnboarding: true,
        });

        expect(path.startsWith('/onboarding/')).toBe(false);
    });

    it('opens the room directly when no parent space can be resolved', () => {
        const room = '!orphan:server';
        // getRoom → null (not a space) and no parents → space unresolved.
        const mx = makeMx({});

        const path = resolvePostAcceptancePath(mx, noParents, noDirects, room);

        expect(path.startsWith('/onboarding/')).toBe(false);
        expect(path).toContain(encodeURIComponent(room));
    });

    it('routes a room inside a space into that space context', () => {
        const room = '!den:server';
        const space = '!canopy:server';
        const roomToParents: RoomToParents = new Map([[room, new Set([space])]]);
        const mx = makeMx({
            rooms: { [room]: makeRoom(false), [space]: makeRoom(true) },
            completedSpaces: { [space]: true },
        });

        const path = resolvePostAcceptancePath(mx, roomToParents, noDirects, room);

        expect(path.startsWith('/onboarding/')).toBe(false);
        expect(path).toContain(encodeURIComponent(space));
        expect(path).toContain(encodeURIComponent(room));
    });
});
