import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent, type MatrixEvent, type Room } from 'matrix-js-sdk';
import {
    REACTION_BURST_TTL_MS,
    REACTION_SEND_THROTTLE_MS,
    WATCH_PARTY_REACTION_EVENT_TYPE,
    WATCH_PARTY_REQUEST_EVENT_TYPE,
    type ReactionBurst,
    type WatchPartyReactionKey,
    appendBurst,
    collectControlRequests,
    parseReactionKey,
} from './watchPartyLive';

export interface WatchPartyLiveHandle {
    /** Reactions currently floating over the player, oldest first. */
    bursts: ReactionBurst[];
    /** Members waiting for the host to hand over control, longest-waiting first. */
    controlRequests: string[];
    sendReaction: (key: WatchPartyReactionKey) => void;
    requestControl: () => Promise<void>;
}

const toTimelineLike = (event: MatrixEvent) => ({
    type: event.getType(),
    sender: event.getSender() ?? '',
    originServerTs: event.getTs(),
});

/**
 * Live-interaction side channel for an active watch party: floating emoji
 * bursts and the host's control-request queue, both carried by ordinary
 * timeline events (default PL 0) so every member can participate.
 */
export const useWatchPartyLive = (room: Room, hostId: string): WatchPartyLiveHandle => {
    const mx = room.client;
    const [bursts, setBursts] = useState<ReactionBurst[]>([]);
    const [controlRequests, setControlRequests] = useState<string[]>(() =>
        collectControlRequests(
            room.getLiveTimeline().getEvents().map(toTimelineLike),
            hostId,
            Date.now()
        )
    );
    const lastSendRef = useRef(0);

    // Recompute the queue when the host changes (their own stale request drops).
    useEffect(() => {
        setControlRequests(
            collectControlRequests(
                room.getLiveTimeline().getEvents().map(toTimelineLike),
                hostId,
                Date.now()
            )
        );
    }, [room, hostId]);

    useEffect(() => {
        const expiry = new Set<ReturnType<typeof setTimeout>>();

        const onTimeline = (
            event: MatrixEvent,
            eventRoom: Room | undefined,
            _toStart: boolean | undefined,
            removed: boolean,
            data: { liveEvent?: boolean }
        ) => {
            if (removed || !eventRoom || eventRoom.roomId !== room.roomId || !data.liveEvent) {
                return;
            }

            if (event.getType() === WATCH_PARTY_REACTION_EVENT_TYPE) {
                const key = parseReactionKey(event.getContent());
                const senderId = event.getSender();
                const id = event.getId();
                if (!key || !senderId || !id) return;
                setBursts((prev) => appendBurst(prev, { id, key, senderId }));
                const timer = setTimeout(() => {
                    expiry.delete(timer);
                    setBursts((prev) => prev.filter((b) => b.id !== id));
                }, REACTION_BURST_TTL_MS);
                expiry.add(timer);
                return;
            }

            if (event.getType() === WATCH_PARTY_REQUEST_EVENT_TYPE) {
                setControlRequests(
                    collectControlRequests(
                        room.getLiveTimeline().getEvents().map(toTimelineLike),
                        hostId,
                        Date.now()
                    )
                );
            }
        };

        mx.on(RoomEvent.Timeline, onTimeline);
        return () => {
            mx.removeListener(RoomEvent.Timeline, onTimeline);
            expiry.forEach((timer) => clearTimeout(timer));
        };
    }, [mx, room, hostId]);

    const sendReaction = useCallback(
        (key: WatchPartyReactionKey) => {
            const now = Date.now();
            if (now - lastSendRef.current < REACTION_SEND_THROTTLE_MS) return;
            lastSendRef.current = now;
            void mx
                .sendEvent(room.roomId, WATCH_PARTY_REACTION_EVENT_TYPE as never, { key } as never)
                .catch(() => undefined);
        },
        [mx, room.roomId]
    );

    const requestControl = useCallback(async () => {
        await mx.sendEvent(
            room.roomId,
            WATCH_PARTY_REQUEST_EVENT_TYPE as never,
            { requested_ts: Date.now() } as never
        );
    }, [mx, room.roomId]);

    return { bursts, controlRequests, sendReaction, requestControl };
};
