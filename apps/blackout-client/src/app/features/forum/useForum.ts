import { useCallback, useMemo } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoom } from '../../hooks/useRoom';
import { useRoomTimeline } from '../../hooks/useTimeline';

export interface ForumTag {
    name: string;
    color: string;
    emoji: string;
}

export interface ForumSettings {
    enabled: boolean;
    defaultSort: 'hot' | 'new' | 'top';
    tags: ForumTag[];
    guidelines: string;
    requireTag: boolean;
}

export const FORUM_EVENT_TYPE = 'co.bmc.forum';

export interface ForumPostModel {
    event: MatrixEvent;
    eventId: string;
    body: string;
    title: string;
    authorId: string;
    timestamp: number;
    replyCount: number;
    reactionCount: number;
    tags: string[];
}

const defaultForumSettings: ForumSettings = {
    enabled: false,
    defaultSort: 'hot',
    tags: [],
    guidelines: '',
    requireTag: false,
};

const toForumSettings = (content: Record<string, unknown> | undefined): ForumSettings => {
    if (!content) return defaultForumSettings;

    const tags = Array.isArray(content.tags)
        ? content.tags
              .map((tag) => {
                  if (!tag || typeof tag !== 'object') return null;
                  const item = tag as Record<string, unknown>;
                  if (
                      typeof item.name !== 'string' ||
                      typeof item.color !== 'string' ||
                      typeof item.emoji !== 'string'
                  )
                      return null;
                  return { name: item.name, color: item.color, emoji: item.emoji };
              })
              .filter((tag): tag is ForumTag => tag !== null)
        : [];

    const defaultSortRaw = content.defaultSort;
    const defaultSort =
        defaultSortRaw === 'new' || defaultSortRaw === 'top' ? defaultSortRaw : 'hot';

    return {
        enabled: content.enabled === true,
        defaultSort,
        tags,
        guidelines: typeof content.guidelines === 'string' ? content.guidelines : '',
        requireTag: content.requireTag === true,
    };
};

const parseTagsFromMessage = (event: MatrixEvent): string[] => {
    const content = event.getContent<Record<string, unknown>>();
    if (Array.isArray(content['co.bmc.forum.tags'])) {
        return (content['co.bmc.forum.tags'] as unknown[]).filter(
            (item): item is string => typeof item === 'string',
        );
    }
    return [];
};

const isThreadReply = (event: MatrixEvent): boolean => {
    const content = event.getContent<Record<string, unknown>>();
    const relatesTo = content['m.relates_to'];
    if (!relatesTo || typeof relatesTo !== 'object') return false;
    const rel = relatesTo as Record<string, unknown>;
    return rel.rel_type === 'm.thread';
};

const getThreadRootEventId = (event: MatrixEvent): string | null => {
    const content = event.getContent<Record<string, unknown>>();
    const relatesTo = content['m.relates_to'];
    if (!relatesTo || typeof relatesTo !== 'object') return null;
    const rel = relatesTo as Record<string, unknown>;
    return rel.rel_type === 'm.thread' && typeof rel.event_id === 'string' ? rel.event_id : null;
};

const isForumRoot = (event: MatrixEvent): boolean => {
    if (event.getType() !== 'm.room.message') return false;
    if (event.isRedacted()) return false;
    return !isThreadReply(event);
};

const titleFromBody = (body: string): string => body.split('\n')[0]?.trim() || 'Untitled post';

export const useForumSettings = (roomId: string) => {
    const roomState = useRoom(roomId);

    return useMemo(() => {
        const event = roomState.data?.currentState.getStateEvents(FORUM_EVENT_TYPE, '');
        const content = event?.getContent<Record<string, unknown>>();

        return {
            data: toForumSettings(content),
            loading: roomState.loading,
            error: roomState.error,
        };
    }, [roomState.data, roomState.error, roomState.loading]);
};

export const useSetForumSettings = (roomId: string) => {
    const client = useMatrixClient();
    return useCallback(
        async (settings: ForumSettings) => {
            await client.sendStateEvent(roomId, FORUM_EVENT_TYPE as never, settings as never, '');
        },
        [client, roomId],
    );
};

export const useForumPosts = (roomId: string) => {
    const timeline = useRoomTimeline(roomId);

    return useMemo(() => {
        const events = timeline.data;
        const replies = new Map<string, number>();
        const reactions = new Map<string, number>();

        events.forEach((event) => {
            if (event.getType() === 'm.reaction') {
                const relation = event.getRelation();
                const target = relation?.event_id;
                if (target) reactions.set(target, (reactions.get(target) ?? 0) + 1);
            }

            if (event.getType() === 'm.room.message') {
                const rootId = getThreadRootEventId(event);
                if (rootId) replies.set(rootId, (replies.get(rootId) ?? 0) + 1);
            }
        });

        const roots: ForumPostModel[] = events
            .filter(isForumRoot)
            .map((event) => {
                const content = event.getContent<Record<string, unknown>>();
                const body = typeof content.body === 'string' ? content.body : '';
                const eventId = event.getId() ?? '';
                return {
                    event,
                    eventId,
                    body,
                    title: titleFromBody(body),
                    authorId: event.getSender() ?? 'unknown',
                    timestamp: event.getTs(),
                    replyCount: replies.get(eventId) ?? 0,
                    reactionCount: reactions.get(eventId) ?? 0,
                    tags: parseTagsFromMessage(event),
                };
            })
            .filter((post) => Boolean(post.eventId));

        return {
            ...timeline,
            data: roots,
        };
    }, [timeline]);
};
