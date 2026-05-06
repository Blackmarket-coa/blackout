import { EVENT_STATE_TYPE, parseEventStateContent, type EventStateContent } from './eventSchema';

/**
 * Pure helpers that lift `co.bmc.event` Matrix state events into a
 * directory-friendly view. Modeled after the HomeFeed `feedModel`
 * pattern: a small `RoomLike` shape so this module stays
 * matrix-js-sdk-free for tests and registry-load paths.
 */

export interface EventViewItem {
    /** Composite id used as the React key. */
    id: string;
    /** Room (canopy or den) hosting the event. */
    roomId: string;
    /** State event id (the event-key for `m.reaction` RSVPs). */
    eventId: string;
    title: string;
    description: string;
    startsAt: string;
    endsAt?: string;
    location?: string;
    visibility: EventStateContent['visibility'];
    tags: string[];
    /** ISO timestamp the state event was last set. */
    updatedAt: string;
    /** Pre-computed sort key (ms-since-epoch from startsAt). */
    startsAtMs: number;
}

export interface EventStateLike {
    /** `m.room.state` event id. */
    getId(): string | undefined;
    /** Returns the parsed `content` object directly. */
    getContent(): unknown;
    /** ISO server-set timestamp on the state event. */
    getTs?(): number;
}

export interface RoomWithStateLike {
    readonly roomId: string;
    name?: string;
    /**
     * Returns all `co.bmc.event` state events on the room. Different
     * matrix-js-sdk versions expose this slightly differently; the
     * adapter accepts either an `events` map or a flat array.
     */
    getEventState(): EventStateLike[];
    getMyMembership?(): string;
}

export const collectEventsFromRoom = (room: RoomWithStateLike): EventViewItem[] => {
    if (typeof room.getMyMembership === 'function' && room.getMyMembership() !== 'join') {
        return [];
    }
    const items: EventViewItem[] = [];
    for (const stateEvent of room.getEventState()) {
        const eventId = stateEvent.getId();
        if (!eventId) continue;
        const content = parseEventStateContent(stateEvent.getContent());
        if (!content) continue;
        const startsAtMs = Date.parse(content.startsAt);
        if (!Number.isFinite(startsAtMs)) continue;
        const updatedAt =
            typeof stateEvent.getTs === 'function'
                ? new Date(stateEvent.getTs()).toISOString()
                : new Date().toISOString();
        items.push({
            id: `${room.roomId}:${eventId}`,
            roomId: room.roomId,
            eventId,
            title: content.title,
            description: content.description,
            startsAt: content.startsAt,
            endsAt: content.endsAt,
            location: content.location,
            visibility: content.visibility,
            tags: content.tags ?? [],
            updatedAt,
            startsAtMs,
        });
    }
    return items;
};

/**
 * Reads `co.bmc.event` state events across a list of rooms and
 * orders them. Default order is upcoming-first (chronological by
 * `startsAt`); past events come last in reverse-chrono order.
 */
export const buildEventDirectory = (
    rooms: readonly RoomWithStateLike[],
    now: number = Date.now(),
    options: { limit?: number; includePast?: boolean } = {}
): EventViewItem[] => {
    const limit = options.limit ?? 100;
    const includePast = options.includePast ?? true;
    const items = rooms.flatMap((room) => collectEventsFromRoom(room));

    const upcoming = items.filter((item) => item.startsAtMs >= now);
    const past = includePast ? items.filter((item) => item.startsAtMs < now) : [];

    upcoming.sort((a, b) => a.startsAtMs - b.startsAtMs || a.title.localeCompare(b.title));
    past.sort((a, b) => b.startsAtMs - a.startsAtMs || a.title.localeCompare(b.title));

    return [...upcoming, ...past].slice(0, limit);
};

/**
 * Splits a directory list by upcoming / past so the directory page
 * can render section headers without re-walking the array.
 */
export const splitEventsByTimeline = (
    items: readonly EventViewItem[],
    now: number = Date.now()
): { upcoming: EventViewItem[]; past: EventViewItem[] } => ({
    upcoming: items.filter((item) => item.startsAtMs >= now),
    past: items.filter((item) => item.startsAtMs < now),
});

export { EVENT_STATE_TYPE } from './eventSchema';
