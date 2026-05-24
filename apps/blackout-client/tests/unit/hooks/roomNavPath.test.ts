import { describe, expect, it } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomToParents } from '../../../src/types/matrix/room';
import { roomNavPath } from '../../../src/app/hooks/roomNavPath';

const mx = {} as MatrixClient; // not used for the single-parent / orphan cases
const base = {
    mx,
    spaceSelectedId: null as string | null,
    developerTools: false,
};

describe('roomNavPath', () => {
    it('opens a den under its parent canopy', () => {
        const den = '!den:server';
        const canopy = '!canopy:server';
        const roomToParents: RoomToParents = new Map([[den, new Set([canopy])]]);

        const path = roomNavPath({ ...base, roomToParents, roomId: den });

        expect(path).toBe(
            `/communities/${encodeURIComponent(canopy)}/dens/${encodeURIComponent(den)}`,
        );
    });

    it('opens an orphan room under the no-canopy sentinel (never legacy /home)', () => {
        const room = '!orphan:server';
        const path = roomNavPath({ ...base, roomToParents: new Map(), roomId: room });

        expect(path).toBe(`/communities/-/dens/${encodeURIComponent(room)}`);
        expect(path.startsWith('/home/')).toBe(false);
    });

    it('appends ?event= for message-anchored navigation', () => {
        const room = '!orphan:server';
        const path = roomNavPath({
            ...base,
            roomToParents: new Map(),
            roomId: room,
            eventId: '$evt:server',
        });

        expect(path).toBe(
            `/communities/-/dens/${encodeURIComponent(room)}?event=${encodeURIComponent('$evt:server')}`,
        );
    });

    it('prefers the currently-selected canopy when it is a parent', () => {
        const den = '!den:server';
        const canopy = '!canopy:server';
        const roomToParents: RoomToParents = new Map([[den, new Set([canopy])]]);

        const path = roomNavPath({
            ...base,
            roomToParents,
            spaceSelectedId: canopy,
            roomId: den,
        });

        expect(path).toBe(
            `/communities/${encodeURIComponent(canopy)}/dens/${encodeURIComponent(den)}`,
        );
    });

    it('opens a space’s own timeline under dev tools', () => {
        const space = '!canopy:server';
        const path = roomNavPath({
            ...base,
            roomToParents: new Map(),
            spaceSelectedId: space,
            developerTools: true,
            roomId: space,
        });

        expect(path).toBe(
            `/communities/${encodeURIComponent(space)}/dens/${encodeURIComponent(space)}`,
        );
    });
});
