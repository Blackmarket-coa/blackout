import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { joinedRoomsAtom } from '../../state/rooms';
import { EVENTS_PATH, buildCommunitiesPath } from '../../pages/paths';
import { parseEventStateContent, type EventStateContent } from './eventSchema';
import { EVENT_STATE_TYPE } from './eventModel';

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
    gap: 6,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const subStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const bodyStyle: CSSProperties = {
    padding: '8px 20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
};

const cardStyle: CSSProperties = {
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
    fontSize: 14,
    lineHeight: 1.5,
};

const breadcrumbStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
};

const formatRange = (content: EventStateContent): string => {
    try {
        const formatter = new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
        const start = formatter.format(new Date(content.startsAt));
        const end = content.endsAt ? ` – ${formatter.format(new Date(content.endsAt))}` : '';
        return `${start}${end}`;
    } catch {
        return content.startsAt;
    }
};

interface RawStateEvent {
    getId(): string | undefined;
    getContent(): unknown;
}

interface RawRoom {
    roomId: string;
    name?: string;
    getMyMembership(): string;
    currentState?: { getStateEvents(eventType: string): RawStateEvent[] };
    getLiveTimeline?(): {
        getState?: (
            direction: 'b' | 'f'
        ) => { getStateEvents(eventType: string): RawStateEvent[] } | null;
    };
}

const findEventInRooms = (
    rooms: RawRoom[],
    roomId: string,
    eventId: string
): { content: EventStateContent; room: RawRoom } | null => {
    const room = rooms.find((entry) => entry.roomId === roomId);
    if (!room) return null;
    const direct = room.currentState?.getStateEvents(EVENT_STATE_TYPE) ?? [];
    const fromTimeline =
        room.getLiveTimeline?.()?.getState?.('f')?.getStateEvents(EVENT_STATE_TYPE) ?? [];
    const all = direct.length > 0 ? direct : fromTimeline;
    for (const stateEvent of all) {
        if (stateEvent.getId() !== eventId) continue;
        const content = parseEventStateContent(stateEvent.getContent());
        if (content) return { content, room };
    }
    return null;
};

/**
 * `/events/:roomId/:eventId` — a focused single-event view. RSVP
 * affordances are intentionally placeholder: the visible counts come
 * from the same Matrix-reaction store the rest of the app already
 * consumes, but the live count + `m.reaction` writes land in a
 * follow-up PR (the current room/timeline reaction surface needs
 * extension to accept reactions on state events). Until then the
 * page renders metadata + a CTA to open the canopy/den hosting the
 * event so users can RSVP via the existing reaction picker on the
 * event message.
 */
export const EventDetail = (): JSX.Element => {
    const { roomId, eventId } = useParams<{ roomId: string; eventId: string }>();
    const decodedRoomId = roomId ? decodeURIComponent(roomId) : '';
    const decodedEventId = eventId ? decodeURIComponent(eventId) : '';
    const joinedRooms = useAtomValue(joinedRoomsAtom);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    const result = useMemo(
        () => findEventInRooms(joinedRooms as unknown as RawRoom[], decodedRoomId, decodedEventId),
        [joinedRooms, decodedRoomId, decodedEventId]
    );

    if (!result) {
        return (
            <section style={layoutStyle} data-shell-region="event-detail">
                <header style={headerStyle}>
                    <span style={breadcrumbStyle}>
                        <Link to={EVENTS_PATH} style={{ color: 'inherit' }}>
                            Events
                        </Link>
                    </span>
                    <h1 style={titleStyle}>Event not found</h1>
                    <p style={subStyle}>
                        This event may have been deleted, or you no longer have access to its host
                        room.
                    </p>
                </header>
            </section>
        );
    }

    const { content, room } = result;
    const isPast = Date.parse(content.startsAt) < now;

    return (
        <section
            style={layoutStyle}
            data-shell-region="event-detail"
            data-event-id={decodedEventId}
            data-room-id={decodedRoomId}
            data-event-state={isPast ? 'past' : 'upcoming'}
        >
            <header style={headerStyle}>
                <span style={breadcrumbStyle}>
                    <Link to={EVENTS_PATH} style={{ color: 'inherit' }}>
                        Events
                    </Link>{' '}
                    /{' '}
                    <Link to={buildCommunitiesPath(null, room.roomId)} style={{ color: 'inherit' }}>
                        {room.name ?? room.roomId}
                    </Link>
                </span>
                <h1 style={titleStyle}>{content.title}</h1>
                <p style={subStyle}>
                    {formatRange(content)}
                    {content.location ? ` · ${content.location}` : ''}
                </p>
                {content.tags && content.tags.length > 0 ? (
                    <p style={subStyle}>{content.tags.map((tag) => `#${tag}`).join(' · ')}</p>
                ) : null}
            </header>
            <div style={bodyStyle}>
                <div style={cardStyle} data-testid="event-detail-description">
                    {content.description}
                </div>
                <div style={cardStyle} data-testid="event-detail-rsvp">
                    RSVP via the reaction picker on the event message inside{' '}
                    <Link
                        to={buildCommunitiesPath(null, room.roomId)}
                        style={{ color: 'var(--accent-primary, #3b82f6)' }}
                    >
                        {room.name ?? room.roomId}
                    </Link>
                    . The dedicated RSVP control lands in a follow-up.
                </div>
            </div>
        </section>
    );
};

export default EventDetail;
