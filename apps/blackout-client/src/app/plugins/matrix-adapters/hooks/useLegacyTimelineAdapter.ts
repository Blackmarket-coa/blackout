import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { useLegacyMatrixClientAdapter as useMatrixClient } from './useLegacyMatrixClientAdapter';
import { useLegacyRoomAdapter as useRoom } from './useLegacyRoomAdapter';
import { uploadMedia } from '../../../features/media/utils/matrixMedia';
import {
    buildEphemeralContent,
    type EphemeralPolicy,
} from '../../../features/ephemeral/ephemeralPolicy';

export interface HookResult<T> {
    data: T;
    loading: boolean;
    error: Error | null;
}

export interface TimelineResult extends HookResult<MatrixEvent[]> {
    loadMore: (limit?: number) => Promise<void>;
}

export const useLegacyRoomTimelineAdapter = (roomId: string): TimelineResult => {
    const client = useMatrixClient();
    const roomState = useRoom(roomId);
    const [events, setEvents] = useState<MatrixEvent[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback((room: Room | null) => {
        if (!room) {
            setEvents([]);
            return;
        }
        setEvents([...room.getLiveTimeline().getEvents()]);
    }, []);

    useEffect(() => {
        setLoading(true);
        setError(null);
        try {
            refresh(roomState.data);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to load timeline.'));
        } finally {
            setLoading(false);
        }

        const onTimeline = () => refresh(roomState.data);
        const emitter = client as unknown as {
            on: (event: string, cb: () => void) => void;
            off: (event: string, cb: () => void) => void;
        };
        emitter.on('Room.timeline', onTimeline);

        return () => {
            emitter.off('Room.timeline', onTimeline);
        };
    }, [client, refresh, roomState.data]);

    const loadMore = useCallback(
        async (limit = 50) => {
            if (!roomState.data) return;
            setLoading(true);
            try {
                await client.scrollback(roomState.data, limit);
                refresh(roomState.data);
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to paginate timeline.'));
            } finally {
                setLoading(false);
            }
        },
        [client, refresh, roomState.data]
    );

    return useMemo(
        () => ({
            data: events,
            loading: loading || roomState.loading,
            error: error ?? roomState.error,
            loadMore,
        }),
        [error, events, loadMore, loading, roomState.error, roomState.loading]
    );
};

const timelineScrollStorageKey = 'blackout.timeline.scroll.v1';

export const useLegacyTimelineScrollAdapter = (roomId: string) => {
    const [position, setPosition] = useState<number>(0);

    useEffect(() => {
        const raw = window.localStorage.getItem(timelineScrollStorageKey);
        if (!raw) {
            setPosition(0);
            return;
        }

        const map = JSON.parse(raw) as Record<string, number>;
        setPosition(map[roomId] ?? 0);
    }, [roomId]);

    const savePosition = useCallback(
        (next: number) => {
            setPosition(next);

            const raw = window.localStorage.getItem(timelineScrollStorageKey);
            const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
            map[roomId] = next;
            window.localStorage.setItem(timelineScrollStorageKey, JSON.stringify(map));
        },
        [roomId]
    );

    return { position, savePosition };
};

export const useLegacySendMessageAdapter = (roomId: string) => {
    const client = useMatrixClient();
    const sendEvent = useCallback(
        (roomIdArg: string, eventType: string, content: Record<string, unknown>) =>
            (
                client as unknown as {
                    sendEvent: (
                        rid: string,
                        et: string,
                        c: Record<string, unknown>
                    ) => Promise<unknown>;
                }
            ).sendEvent(roomIdArg, eventType, content),
        [client]
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const withStatus = useCallback(async (action: () => Promise<void>, fallbackMessage: string) => {
        setLoading(true);
        setError(null);
        try {
            await action();
        } catch (err) {
            setError(err instanceof Error ? err : new Error(fallbackMessage));
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    const sendText = useCallback(
        async (body: string) => {
            setLoading(true);
            setError(null);
            try {
                await sendEvent(roomId, 'm.room.message', { msgtype: 'm.text', body });
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to send message.'));
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [roomId, sendEvent]
    );

    const sendRichText = useCallback(
        async (content: Record<string, unknown>) => {
            setLoading(true);
            setError(null);
            try {
                await sendEvent(roomId, 'm.room.message', content);
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to send rich message.'));
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [roomId, sendEvent]
    );

    const sendMedia = useCallback(
        async (file: File, options?: { ephemeral?: EphemeralPolicy | null }) => {
            setLoading(true);
            setError(null);
            try {
                const url = await uploadMedia(client, file);
                const ephemeralBlock = options?.ephemeral
                    ? buildEphemeralContent(options.ephemeral)
                    : null;
                await sendEvent(roomId, 'm.room.message', {
                    msgtype: 'm.file',
                    body: file.name,
                    url,
                    info: {
                        mimetype: file.type,
                        size: file.size,
                    },
                    ...(ephemeralBlock ?? {}),
                });
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to send media.'));
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [client, roomId, sendEvent]
    );

    const sendReply = useCallback(
        async (body: string, eventId: string) => {
            await withStatus(async () => {
                await sendEvent(roomId, 'm.room.message', {
                    msgtype: 'm.text',
                    body,
                    'm.relates_to': {
                        'm.in_reply_to': { event_id: eventId },
                    },
                });
            }, 'Failed to send reply.');
        },
        [roomId, sendEvent, withStatus]
    );

    const sendThread = useCallback(
        async (body: string, rootEventId: string) => {
            await withStatus(async () => {
                await sendEvent(roomId, 'm.room.message', {
                    msgtype: 'm.text',
                    body,
                    'm.relates_to': {
                        rel_type: 'm.thread',
                        event_id: rootEventId,
                        is_falling_back: true,
                        'm.in_reply_to': { event_id: rootEventId },
                    },
                });
            }, 'Failed to send thread reply.');
        },
        [roomId, sendEvent, withStatus]
    );

    return { sendText, sendRichText, sendMedia, sendReply, sendThread, loading, error };
};

export const useLegacyEditMessageAdapter = (roomId: string) => {
    const client = useMatrixClient();
    const sendEvent = useCallback(
        (roomIdArg: string, eventType: string, content: Record<string, unknown>) =>
            (
                client as unknown as {
                    sendEvent: (
                        rid: string,
                        et: string,
                        c: Record<string, unknown>
                    ) => Promise<unknown>;
                }
            ).sendEvent(roomIdArg, eventType, content),
        [client]
    );

    return useCallback(
        async (targetEventId: string, body: string) => {
            await sendEvent(roomId, 'm.room.message', {
                msgtype: 'm.text',
                body: `* ${body}`,
                'm.new_content': {
                    msgtype: 'm.text',
                    body,
                },
                'm.relates_to': {
                    rel_type: 'm.replace',
                    event_id: targetEventId,
                },
            });
        },
        [roomId, sendEvent]
    );
};

export const useLegacyReactionAdapter = (roomId: string) => {
    const client = useMatrixClient();
    const sendEvent = useCallback(
        (roomIdArg: string, eventType: string, content: Record<string, unknown>) =>
            (
                client as unknown as {
                    sendEvent: (
                        rid: string,
                        et: string,
                        c: Record<string, unknown>
                    ) => Promise<unknown>;
                }
            ).sendEvent(roomIdArg, eventType, content),
        [client]
    );

    const addReaction = useCallback(
        async (targetEventId: string, key: string) => {
            await sendEvent(roomId, 'm.reaction', {
                'm.relates_to': {
                    rel_type: 'm.annotation',
                    event_id: targetEventId,
                    key,
                },
            });
        },
        [roomId, sendEvent]
    );

    const removeReaction = useCallback(
        async (reactionEventId: string) => {
            await client.redactEvent(roomId, reactionEventId, undefined, {
                reason: 'Reaction removed',
            });
        },
        [client, roomId]
    );

    return { addReaction, removeReaction };
};
