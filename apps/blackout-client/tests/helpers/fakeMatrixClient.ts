// Shared test helper for Workstream A's ClientLayout-anchored tests.
//
// Returns an object that quacks like a `MatrixClient` for the surfaces
// the modern shell touches at mount: `getRooms`, `getRoom`, `getUser`,
// `getAccountData`, account-data event listeners, and the no-op write
// methods (`setAccountData`, `leave`, `joinRoom`).
//
// Tests can pass `rooms` and per-method `overrides`; anything not
// overridden falls back to a sensible defaultish noop so the React
// render tree doesn't throw on a missing method.

import { vi } from 'vitest';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

export interface FakeClientOverrides {
    rooms?: Room[];
    user?: { presence?: string };
    accountData?: Record<string, unknown>;
    /** Pass-through for anything not anticipated by the defaults. */
    extras?: Partial<MatrixClient>;
}

export const createFakeMatrixClient = (overrides: FakeClientOverrides = {}): MatrixClient => {
    const rooms = overrides.rooms ?? [];
    const accountData = overrides.accountData ?? {};
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    const base = {
        // Read surface
        getRooms: () => rooms,
        getRoom: (roomId: string) => rooms.find((room) => room.roomId === roomId) ?? null,
        getUser: () => overrides.user ?? { presence: 'online' },
        getUserId: () => '@user:example.org',
        getHomeserverUrl: () => 'https://matrix.example.org',
        getAccountData: (eventType: string) => {
            const value = accountData[eventType];
            if (value === undefined) return undefined;
            return {
                getType: () => eventType,
                getContent: <T = unknown>() => value as T,
                // Account-data events have no room/state key; the MSC2545 pack reader
                // (ImagePack.fromMatrixEvent) probes both to build a pack address.
                getRoomId: () => undefined,
                getStateKey: () => undefined,
            };
        },
        getCrypto: () => undefined,

        // Write surface — best-effort noops so callers don't blow up.
        setAccountData: vi.fn().mockResolvedValue(undefined),
        leave: vi.fn().mockResolvedValue(undefined),
        joinRoom: vi.fn().mockResolvedValue({ roomId: '!joined:example.org' }),
        sendEvent: vi.fn().mockResolvedValue({ event_id: '$evt:example.org' }),
        redactEvent: vi.fn().mockResolvedValue(undefined),
        setPowerLevel: vi.fn().mockResolvedValue(undefined),
        setRoomReadMarkers: vi.fn().mockResolvedValue(undefined),
        sendReadReceipt: vi.fn().mockResolvedValue(undefined),

        // EventEmitter-shaped subscription surface used by useAccountDataCallback
        // and a handful of other client-side hooks.
        on: (event: string, handler: (...args: unknown[]) => void) => {
            const arr = listeners.get(event) ?? [];
            arr.push(handler);
            listeners.set(event, arr);
        },
        off: (event: string, handler: (...args: unknown[]) => void) => {
            const arr = listeners.get(event);
            if (!arr) return;
            const idx = arr.indexOf(handler);
            if (idx >= 0) arr.splice(idx, 1);
        },
        removeListener: (event: string, handler: (...args: unknown[]) => void) => {
            const arr = listeners.get(event);
            if (!arr) return;
            const idx = arr.indexOf(handler);
            if (idx >= 0) arr.splice(idx, 1);
        },
        once: (event: string, handler: (...args: unknown[]) => void) => {
            const arr = listeners.get(event) ?? [];
            arr.push(handler);
            listeners.set(event, arr);
        },
        emit: (event: string, ...args: unknown[]) => {
            const arr = listeners.get(event);
            if (!arr) return false;
            arr.slice().forEach((handler) => handler(...args));
            return true;
        },
        listeners: (event: string) => listeners.get(event)?.slice() ?? [],

        // Push-rule surface — needed by getNotificationType.
        getRoomPushRule: () => undefined,

        ...overrides.extras,
    };

    return base as unknown as MatrixClient;
};

export interface FakeRoomOverrides {
    roomId?: string;
    name?: string;
    type?: string;
    membership?: 'join' | 'invite' | 'leave';
    powerLevelUsers?: Record<string, number>;
    powerLevelUsersDefault?: number;
    joinedMembers?: Array<{ userId: string }>;
    unreadTotal?: number;
    unreadHighlight?: number;
    topic?: string;
    joinRule?: string;
    /** Account-data event-type → content map (room-scoped state). */
    stateEvents?: Record<string, unknown>;
    /** When set, `room.isSpaceRoom()` returns this regardless of `type`. */
    isSpaceRoom?: boolean;
    mxcAvatarUrl?: string;
    /**
     * Events surfaced by `room.getLiveTimeline().getEvents()`. The room
     * owns the array so callers can mutate it after construction (e.g.
     * push a new reaction then re-emit `Room.timeline` from the fake
     * client to trigger the adapter's listener).
     */
    timelineEvents?: MatrixEvent[];
}

export const createFakeRoom = (overrides: FakeRoomOverrides = {}): Room => {
    const roomId = overrides.roomId ?? '!room:example.org';
    const name = overrides.name ?? roomId;
    const type = overrides.type;
    const membership = overrides.membership ?? 'join';
    const stateEvents: Record<string, unknown> = { ...(overrides.stateEvents ?? {}) };

    // Power-levels state event derived from explicit users/default overrides.
    if (overrides.powerLevelUsers !== undefined || overrides.powerLevelUsersDefault !== undefined) {
        stateEvents['m.room.power_levels'] = {
            users: overrides.powerLevelUsers ?? {},
            users_default: overrides.powerLevelUsersDefault ?? 0,
        };
    }

    if (overrides.topic !== undefined) {
        stateEvents['m.room.topic'] = { topic: overrides.topic };
    }
    if (overrides.joinRule !== undefined) {
        stateEvents['m.room.join_rules'] = { join_rule: overrides.joinRule };
    }

    const stateEventWrap = (eventType: string) => {
        const content = stateEvents[eventType];
        if (content === undefined) return undefined;
        return {
            getType: () => eventType,
            getStateKey: () => '',
            getContent: <T = unknown>() => content as T,
            // Some consumers key derived objects off the event id (e.g. the MSC2545
            // pack reader); synthesize a stable one per event type.
            getId: () => `$state-${eventType}:example.org`,
            getRoomId: () => roomId,
        };
    };

    const currentState = {
        getStateEvents: (eventType: string, stateKey?: string) => {
            if (stateKey !== undefined) return stateEventWrap(eventType);
            // No stateKey → return array of all events of that type. Most callers
            // ask for the single-key form, but a few iterate (e.g. space children).
            const wrapped = stateEventWrap(eventType);
            return wrapped ? [wrapped] : [];
        },
    };

    const timelineEvents = overrides.timelineEvents ?? [];

    const room = {
        roomId,
        name,
        getType: () => type,
        getCanonicalAlias: () => `#${name}:example.org`,
        getMyMembership: () => membership,
        getJoinedMembers: () => overrides.joinedMembers ?? [],
        getUnreadNotificationCount: (kind: number) =>
            kind === 1 ? overrides.unreadHighlight ?? 0 : overrides.unreadTotal ?? 0,
        isSpaceRoom: () => overrides.isSpaceRoom ?? type === 'm.space',
        getMxcAvatarUrl: () => overrides.mxcAvatarUrl ?? null,
        getAvatarFallbackMember: () => undefined,
        getMember: () => null,
        getEventReadUpTo: () => null,
        hasMembershipState: () => false,
        getLiveTimeline: () => ({
            getEvents: () => timelineEvents,
            getState: () => currentState,
        }),
        currentState,
    };

    return room as unknown as Room;
};
