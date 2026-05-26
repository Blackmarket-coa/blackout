import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import { getAllParents } from '../../utils/room';
import type { RoomToParents } from '../../../types/matrix/room';

export type PresenceGroup = 'online' | 'away' | 'offline';

export interface GroupedMembers {
    online: RoomMember[];
    away: RoomMember[];
    offline: RoomMember[];
}

export interface SpaceGroup {
    id: string;
    label: string;
    rooms: Room[];
}

const getMemberPresence = (member: RoomMember): PresenceGroup => {
    const presence = member.events.member?.getContent<Record<string, unknown>>()?.presence;
    if (presence === 'online') return 'online';
    if (presence === 'unavailable') return 'away';
    return 'offline';
};

export const groupMembersByPresence = (members: RoomMember[]): GroupedMembers => {
    return members.reduce<GroupedMembers>(
        (acc, member) => {
            if (member.membership !== 'join') return acc;
            const group = getMemberPresence(member);
            acc[group].push(member);
            return acc;
        },
        { online: [], away: [], offline: [] }
    );
};

export const getTimelineBody = (event: MatrixEvent): string => {
    const content = event.getContent<Record<string, unknown>>();
    return typeof content.body === 'string' ? content.body : '';
};

export const getTimelineRelation = (event: MatrixEvent): Record<string, unknown> | null => {
    const content = event.getContent<Record<string, unknown>>();
    const relation = content['m.relates_to'];
    return typeof relation === 'object' && relation !== null
        ? (relation as Record<string, unknown>)
        : null;
};

export const getEventTimestamp = (event: MatrixEvent): string => {
    const ts = event.getTs?.() ?? Date.now();
    return new Date(ts).toLocaleString();
};

export const getThreadEvents = (events: MatrixEvent[]): MatrixEvent[] =>
    events.filter((event) => getTimelineRelation(event)?.rel_type === 'm.thread');

/**
 * Pull the thread root event id off an event's `m.relates_to` relation,
 * if any. Returns `null` for events that aren't thread replies (no
 * relation, wrong rel_type, missing event_id, or non-string event_id).
 *
 * Foundation helper for the in-room thread panel rewrite (Workstream C,
 * `deferred-bodies-schedule-2026-05-01.md`).
 */
export const getThreadRootEventId = (event: MatrixEvent): string | null => {
    const relation = getTimelineRelation(event);
    if (!relation || relation.rel_type !== 'm.thread') return null;
    const eventId = relation.event_id;
    return typeof eventId === 'string' && eventId.length > 0 ? eventId : null;
};

/**
 * Returns the unique set of thread-root event ids referenced by the
 * thread replies in `events`. Order matches first-occurrence in the
 * input so callers can render the same roots in a stable order without
 * re-sorting.
 */
export const getThreadRootIds = (events: MatrixEvent[]): string[] => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const event of events) {
        const rootId = getThreadRootEventId(event);
        if (!rootId || seen.has(rootId)) continue;
        seen.add(rootId);
        ordered.push(rootId);
    }
    return ordered;
};

/**
 * Groups thread reply events under their root event id. Returns a map
 * from root event id to the chronological list of replies (preserving
 * input order — callers can sort by `event.getTs()` if they need a
 * different ordering). Non-thread events are dropped silently.
 */
export const groupThreadReplies = (events: MatrixEvent[]): Map<string, MatrixEvent[]> => {
    const groups = new Map<string, MatrixEvent[]>();
    for (const event of events) {
        const rootId = getThreadRootEventId(event);
        if (!rootId) continue;
        const list = groups.get(rootId);
        if (list) list.push(event);
        else groups.set(rootId, [event]);
    }
    return groups;
};

/**
 * Find the actual thread-root event in `events` by its id. Returns the
 * first match, or `null` if not present in the timeline window.
 * Useful for the thread panel header (which renders the root message
 * above the reply tree) when the right-panel's event window already
 * contains the root.
 */
export const findThreadRoot = (
    events: MatrixEvent[],
    rootEventId: string,
): MatrixEvent | null => {
    if (!rootEventId) return null;
    for (const event of events) {
        if (event.getId?.() === rootEventId) return event;
    }
    return null;
};

export const getPinnedEvents = (room: Room | null, events: MatrixEvent[]): MatrixEvent[] => {
    if (!room) return [];
    const pinState = room.currentState.getStateEvents('m.room.pinned_events', '');
    const pinned = pinState?.getContent<Record<string, unknown>>()?.pinned;
    if (!Array.isArray(pinned)) return [];

    const pinnedIds = pinned.filter((eventId): eventId is string => typeof eventId === 'string');
    return pinnedIds
        .map((eventId) => events.find((event) => event.getId() === eventId))
        .filter((event): event is MatrixEvent => Boolean(event));
};

export const searchEvents = (events: MatrixEvent[], query: string): MatrixEvent[] => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return events
        .filter((event) => getTimelineBody(event).toLowerCase().includes(normalizedQuery))
        .slice(-50)
        .reverse();
};

export const getOrderedChildIds = (space: Room): string[] => {
    return space.currentState
        .getStateEvents('m.space.child')
        .map((event) => ({
            roomId: event.getStateKey(),
            order:
                typeof event.getContent<Record<string, unknown>>().order === 'string'
                    ? (event.getContent<Record<string, unknown>>().order as string)
                    : 'zzz',
        }))
        .filter((entry): entry is { roomId: string; order: string } => Boolean(entry.roomId))
        .sort((a, b) => a.order.localeCompare(b.order))
        .map((entry) => entry.roomId);
};

const collectSpaceGroups = (
    space: Room,
    roomById: Map<string, Room>,
    groups: SpaceGroup[],
    parentPath = '',
    visited = new Set<string>()
): void => {
    if (visited.has(space.roomId)) return;
    visited.add(space.roomId);

    const orderedChildIds = getOrderedChildIds(space);
    const directRooms = orderedChildIds
        .map((roomId) => roomById.get(roomId))
        .filter((room): room is Room => {
            if (!room) return false;
            return room.getType() !== 'm.space';
        });

    const label = parentPath ? `${parentPath} / ${space.name}` : space.name;
    groups.push({ id: space.roomId, label, rooms: directRooms });

    const childSpaces = orderedChildIds
        .map((roomId) => roomById.get(roomId))
        .filter((room): room is Room => {
            if (!room) return false;
            return room.getType() === 'm.space';
        });

    childSpaces.forEach((childSpace) =>
        collectSpaceGroups(childSpace, roomById, groups, label, new Set(visited))
    );
};

/**
 * Build the "Home" den list (no canopy selected): direct messages and dens
 * with no parent canopy ("orphans"). A den belongs to a canopy only when an
 * `m.space.child`/`m.space.parent` edge exists (tracked live in
 * `roomToParents`), so anything without a parent surfaces here under "Direct"
 * rather than disappearing or being matched by string heuristics.
 */
export const getDirectGroups = ({
    rooms,
    roomToParents,
    mDirect,
}: {
    rooms: Room[];
    roomToParents: RoomToParents;
    mDirect: Set<string>;
}): SpaceGroup[] => {
    const dens = rooms.filter((room) => room.getType() !== 'm.space');
    const dms = dens.filter((room) => mDirect.has(room.roomId));
    const orphans = dens.filter(
        (room) => !mDirect.has(room.roomId) && getAllParents(roomToParents, room.roomId).size === 0
    );

    const groups: SpaceGroup[] = [];
    if (dms.length > 0) {
        groups.push({ id: 'dms', label: 'Direct messages', rooms: dms });
    }
    groups.push({ id: 'direct', label: 'Direct', rooms: orphans });
    return groups;
};

export const buildSpaceGroups = ({
    selectedSpaceId,
    rooms,
    roomToParents,
    mDirect,
}: {
    selectedSpaceId: string | null;
    rooms: Room[];
    roomToParents: RoomToParents;
    mDirect: Set<string>;
}): SpaceGroup[] => {
    // Home: no canopy selected → direct messages + orphan dens, never a flat
    // list of every den the user is in.
    if (!selectedSpaceId) {
        return getDirectGroups({ rooms, roomToParents, mDirect });
    }

    const roomById = new Map(rooms.map((room) => [room.roomId, room]));
    const selectedSpace = roomById.get(selectedSpaceId);
    const orderedChildIds = selectedSpace ? getOrderedChildIds(selectedSpace) : [];

    // Primary path: order dens by the canopy's `m.space.child` state. This reads
    // room state directly and does not depend on the `roomToParents` index.
    if (orderedChildIds.length > 0) {
        const directRooms = orderedChildIds
            .map((roomId) => roomById.get(roomId))
            .filter((room): room is Room => {
                if (!room) return false;
                return room.getType() !== 'm.space';
            });

        const groups: SpaceGroup[] = [{ id: 'general', label: 'General', rooms: directRooms }];
        const childSpaces = orderedChildIds
            .map((roomId) => roomById.get(roomId))
            .filter((room): room is Room => {
                if (!room) return false;
                return room.getType() === 'm.space';
            });

        childSpaces.forEach((space) => collectSpaceGroups(space, roomById, groups));
        return groups;
    }

    // Fallback: the canopy's child state isn't loaded — derive its dens from the
    // live parent index instead of guessing by substring match.
    const childRooms = rooms.filter(
        (room) =>
            room.getType() !== 'm.space' &&
            (roomToParents.get(room.roomId)?.has(selectedSpaceId) ?? false)
    );
    return [{ id: 'general', label: 'General', rooms: childRooms }];
};

export const getUnreadMarkerEventId = (room: Room | null, userId: string | null): string | null => {
    if (!room || !userId) return null;
    return room.getEventReadUpTo(userId, true) ?? null;
};

const getMentionedUserIds = (content: Record<string, unknown>): string[] => {
    const mentions = content['m.mentions'];
    if (!mentions || typeof mentions !== 'object') return [];

    const users = (mentions as Record<string, unknown>).user_ids;
    if (!Array.isArray(users)) return [];
    return users.filter((userId): userId is string => typeof userId === 'string');
};

const eventHighlightsUser = (event: MatrixEvent): boolean => {
    const pushActions = (
        event as MatrixEvent & { getPushActions?: () => unknown }
    ).getPushActions?.();
    if (!pushActions || typeof pushActions !== 'object') return false;

    const tweaks = (pushActions as { tweaks?: unknown }).tweaks;
    if (!tweaks || typeof tweaks !== 'object') return false;
    return Boolean((tweaks as Record<string, unknown>).highlight);
};

export const getUserSharedRoomCount = (
    rooms: Room[],
    userId: string,
    currentUserId: string | null
): number =>
    rooms.filter((room) => {
        if (!currentUserId) return false;
        const me = room.getMember(currentUserId);
        const target = room.getMember(userId);
        return me?.membership === 'join' && target?.membership === 'join';
    }).length;

export const getMemberActivitySummary = (member: RoomMember, presenceGroup: string): string => {
    const currentlyActive = Boolean(
        (member as RoomMember & { currentlyActive?: boolean }).currentlyActive
    );
    const lastActiveAgo = (member as RoomMember & { lastActiveAgo?: number }).lastActiveAgo;

    if (presenceGroup === 'online' && currentlyActive) return 'Active now.';
    if (typeof lastActiveAgo === 'number' && Number.isFinite(lastActiveAgo)) {
        const minutesAgo = Math.max(1, Math.round(lastActiveAgo / 60_000));
        return `Last active ${minutesAgo} minute${minutesAgo === 1 ? '' : 's'} ago.`;
    }

    if (presenceGroup === 'away') return 'Away right now.';
    if (presenceGroup === 'offline') return 'Offline.';
    return 'Status unavailable.';
};
export interface MentionInboxItem {
    roomId: string;
    roomName: string;
    eventId: string;
    body: string;
    timestamp: number;
    unread: boolean;
}

export const getMentionInboxItems = ({
    rooms,
    userId,
    now = Date.now(),
    dedupeWindowMs = 60_000,
}: {
    rooms: Room[];
    userId: string | null;
    now?: number;
    dedupeWindowMs?: number;
}): MentionInboxItem[] => {
    if (!userId) return [];

    const dedupeKeys = new Set<string>();
    const byEventId = new Set<string>();
    const items: MentionInboxItem[] = [];

    rooms.forEach((room) => {
        const events = room
            .getLiveTimeline()
            .getEvents()
            .filter((event) => event.getType() === 'm.room.message');

        const readUpToEventId = room.getEventReadUpTo(userId, true);
        const readUpToTs = readUpToEventId
            ? events.find((event) => event.getId() === readUpToEventId)?.getTs?.() ?? 0
            : 0;

        events.forEach((event) => {
            const eventId = event.getId();
            if (!eventId || byEventId.has(eventId)) return;

            const content = event.getContent<Record<string, unknown>>();
            const body = typeof content.body === 'string' ? content.body : '';
            const timestamp = event.getTs?.() ?? now;
            const mentionUsers = getMentionedUserIds(content);
            const mentionAll = Boolean(
                (content['m.mentions'] as Record<string, unknown> | undefined)?.room
            );
            const isMentioned =
                mentionUsers.includes(userId) || mentionAll || eventHighlightsUser(event);
            if (!isMentioned) return;

            const dedupeKey = `${room.roomId}:${body
                .trim()
                .toLowerCase()
                .slice(0, 64)}:${Math.floor(timestamp / dedupeWindowMs)}`;
            if (dedupeKeys.has(dedupeKey)) return;

            dedupeKeys.add(dedupeKey);
            byEventId.add(eventId);

            items.push({
                roomId: room.roomId,
                roomName: room.name,
                eventId,
                body,
                timestamp,
                unread: timestamp > readUpToTs,
            });
        });
    });

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 40);
};
