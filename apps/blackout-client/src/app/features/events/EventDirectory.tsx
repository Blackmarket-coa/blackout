import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useAtomValue } from 'jotai';
import { joinedRoomsAtom } from '../../state/rooms';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { buildEventDetailPath } from '../../pages/paths';
import {
    buildEventDirectory,
    splitEventsByTimeline,
    type EventViewItem,
    type RoomWithStateLike,
} from './eventModel';
import { EVENT_STATE_TYPE } from './eventSchema';
import EventCalendar from './EventCalendar';

type EventViewMode = 'list' | 'calendar';

const toggleRowStyle: CSSProperties = {
    display: 'flex',
    gap: 6,
    padding: '0 16px 8px',
};

const toggleButtonStyle = (active: boolean): CSSProperties => ({
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 999,
    padding: '4px 12px',
    fontSize: 12,
    cursor: 'pointer',
    background: active ? 'var(--accent-primary, #1ABC9C)' : 'var(--bg-surface, #0f172a)',
    color: active ? '#0a1a0f' : 'var(--text-primary, #f8fafc)',
});

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '20px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const subtitleStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '4px 16px 12px',
};

const sectionLabelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
    margin: '8px 4px 0',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    textDecoration: 'none',
};

const cardTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 600 };
const cardMetaStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
};

const emptyStyle: CSSProperties = {
    margin: '24px 16px',
    padding: '24px 20px',
    border: '1px dashed var(--border-default, #374151)',
    borderRadius: 12,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 14,
    textAlign: 'center',
};

const formatStartsAt = (iso: string): string => {
    try {
        return new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        }).format(new Date(iso));
    } catch {
        return iso;
    }
};

const EventCard = ({ item }: { item: EventViewItem }): JSX.Element => (
    <Link
        to={buildEventDetailPath(item.roomId, item.eventId)}
        style={cardStyle}
        data-testid="event-directory-card"
        data-room-id={item.roomId}
        data-event-id={item.eventId}
    >
        <span style={cardTitleStyle}>{item.title}</span>
        <span style={cardMetaStyle}>
            {formatStartsAt(item.startsAt)}
            {item.location ? ` · ${item.location}` : ''}
        </span>
        {item.tags.length > 0 ? (
            <span style={cardMetaStyle}>{item.tags.map((tag) => `#${tag}`).join(' · ')}</span>
        ) : null}
    </Link>
);

/**
 * Adapter that lifts matrix-js-sdk's `Room` interface into the
 * `RoomWithStateLike` shape `eventModel` operates on. Keeps the
 * model unit-testable without dragging the SDK into the test
 * environment.
 */
const adaptRoom = (room: {
    roomId: string;
    name?: string;
    getMyMembership(): string;
    currentState?: { getStateEvents(eventType: string): unknown[] };
    getLiveTimeline?(): {
        getState?: (direction: 'b' | 'f') => {
            getStateEvents(eventType: string): unknown[];
        } | null;
    };
}): RoomWithStateLike => ({
    roomId: room.roomId,
    name: room.name,
    getMyMembership: room.getMyMembership.bind(room),
    getEventState() {
        const direct = room.currentState?.getStateEvents(EVENT_STATE_TYPE) ?? [];
        if (direct.length > 0)
            return direct as RoomWithStateLike['getEventState'] extends () => infer R ? R : never;
        const fromTimeline =
            room.getLiveTimeline?.()?.getState?.('f')?.getStateEvents(EVENT_STATE_TYPE) ?? [];
        return fromTimeline as RoomWithStateLike['getEventState'] extends () => infer R ? R : never;
    },
});

/**
 * `/events` directory. Walks `joinedRoomsAtom` for `co.bmc.event`
 * state events, sorts upcoming-first, and renders one card per
 * event. RSVP counts are deferred to EventDetail; the directory
 * card stays compact for scannability.
 */
export const EventDirectory = (): JSX.Element => {
    const joinedRooms = useAtomValue(joinedRoomsAtom);
    const [now, setNow] = useState(() => Date.now());
    const [viewMode, setViewMode] = useState<EventViewMode>('list');

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    const items = useMemo(() => {
        const adapted = (joinedRooms as unknown[]).map((room) =>
            adaptRoom(room as Parameters<typeof adaptRoom>[0])
        );
        return buildEventDirectory(adapted, now);
    }, [joinedRooms, now]);

    const { upcoming, past } = useMemo(() => splitEventsByTimeline(items, now), [items, now]);

    return (
        <section style={layoutStyle} data-shell-region="event-directory">
            <header style={headerStyle}>
                <h1 style={titleStyle}>Events</h1>
                <p style={subtitleStyle}>
                    Coalition events from {BLACKOUT_TERMS.canopy.plural} you've joined.
                </p>
            </header>
            {items.length === 0 ? (
                <p style={emptyStyle} data-testid="event-directory-empty">
                    No events scheduled yet. Coalition events you create or RSVP to will appear
                    here.
                </p>
            ) : (
                <>
                    <div style={toggleRowStyle} role="tablist" aria-label="Event view">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={viewMode === 'list'}
                            data-testid="event-view-list"
                            style={toggleButtonStyle(viewMode === 'list')}
                            onClick={() => setViewMode('list')}
                        >
                            List
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={viewMode === 'calendar'}
                            data-testid="event-view-calendar"
                            style={toggleButtonStyle(viewMode === 'calendar')}
                            onClick={() => setViewMode('calendar')}
                        >
                            Calendar
                        </button>
                    </div>
                    {viewMode === 'calendar' ? <EventCalendar items={items} /> : null}
                    {viewMode === 'list' ? (
                        <div data-testid="event-directory-list">
                            {upcoming.length > 0 ? (
                                <section style={sectionStyle} data-bucket="upcoming">
                                    <header style={sectionLabelStyle}>Upcoming</header>
                                    {upcoming.map((item) => (
                                        <EventCard key={item.id} item={item} />
                                    ))}
                                </section>
                            ) : null}
                            {past.length > 0 ? (
                                <section style={sectionStyle} data-bucket="past">
                                    <header style={sectionLabelStyle}>Past</header>
                                    {past.map((item) => (
                                        <EventCard key={item.id} item={item} />
                                    ))}
                                </section>
                            ) : null}
                        </div>
                    ) : null}
                </>
            )}
        </section>
    );
};

export default EventDirectory;
