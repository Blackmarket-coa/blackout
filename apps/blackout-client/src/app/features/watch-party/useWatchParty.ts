import { useCallback, useMemo } from 'react';
import type { Room } from 'matrix-js-sdk';
import { useStateEvent } from '../../hooks/useStateEvent';
import { StateEvent } from '../../../types/matrix/room';
import {
    WATCH_PARTY_STATE_EVENT_TYPE,
    type WatchPartyMode,
    type WatchPartyPatch,
    type WatchPartySource,
    type WatchPartyState,
    canControlParty,
    createWatchParty,
    hostAdvance,
    parseWatchPartyState,
    serializeWatchPartyState,
} from './watchPartyState';

export interface WatchPartyHandle {
    /** Current party, or null when no party is running in this room. */
    state: WatchPartyState | null;
    /** Whether the local user is the authoritative host. */
    isHost: boolean;
    /** Host or room moderator: may start/end parties and drive playback. */
    canControl: boolean;
    startParty: (mode: WatchPartyMode, source: WatchPartySource | null) => Promise<void>;
    /** Host transport write: play/pause/seek/rate/source changes. */
    advance: (patch: WatchPartyPatch) => Promise<void>;
    /** Take over as host (moderators only, when the host is gone/idle). */
    claimHost: () => Promise<void>;
    endParty: () => Promise<void>;
}

/**
 * Room-scoped watch-party state + host controls over the
 * `co.bmc.watch_party` state event. Followers only read; every write path
 * is guarded by `canControlParty` (and the server's own state-event power
 * requirement backs that up).
 */
export const useWatchParty = (room: Room): WatchPartyHandle => {
    const mx = room.client;
    const myUserId = mx.getUserId() ?? '';
    const event = useStateEvent(room, WATCH_PARTY_STATE_EVENT_TYPE as StateEvent);
    const state = useMemo(
        () => parseWatchPartyState(event?.getContent<Record<string, unknown>>()),
        [event]
    );

    const myPower = room.getMember(myUserId)?.powerLevel ?? 0;
    const isHost = !!state && state.hostId === myUserId;
    const canControl = canControlParty(state, myUserId, myPower);

    const persist = useCallback(
        async (content: Record<string, unknown>) => {
            await mx.sendStateEvent(
                room.roomId,
                WATCH_PARTY_STATE_EVENT_TYPE as never,
                content as never,
                ''
            );
        },
        [mx, room.roomId]
    );

    const startParty = useCallback(
        async (mode: WatchPartyMode, source: WatchPartySource | null) => {
            if (!canControl) return;
            const party = createWatchParty({ mode, source, hostId: myUserId, nowTs: Date.now() });
            await persist(serializeWatchPartyState(party));
        },
        [canControl, myUserId, persist]
    );

    const advance = useCallback(
        async (patch: WatchPartyPatch) => {
            if (!state || !canControl) return;
            await persist(serializeWatchPartyState(hostAdvance(state, patch, Date.now())));
        },
        [state, canControl, persist]
    );

    const claimHost = useCallback(async () => {
        if (!state || state.hostId === myUserId || !canControl) return;
        await persist(
            serializeWatchPartyState(hostAdvance(state, { hostId: myUserId }, Date.now()))
        );
    }, [state, myUserId, canControl, persist]);

    const endParty = useCallback(async () => {
        if (!state || !canControl) return;
        // An empty content object parses to null -> "no party running".
        await persist({});
    }, [state, canControl, persist]);

    return { state, isHost, canControl, startParty, advance, claimHost, endParty };
};
