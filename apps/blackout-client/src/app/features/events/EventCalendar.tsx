import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { buildEventDetailPath } from '../../pages/paths';
import { buildMonthGrid, type EventViewItem } from './eventModel';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 16px',
};

const navButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 8,
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
    cursor: 'pointer',
    padding: '4px 10px',
    fontSize: 14,
};

const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 1,
    padding: '0 16px 16px',
};

const weekdayCellStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
    padding: '4px 6px',
    textAlign: 'center',
};

const dayCellBase: CSSProperties = {
    minHeight: 84,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 6,
    padding: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflow: 'hidden',
};

const eventPillStyle: CSSProperties = {
    fontSize: 11,
    padding: '1px 5px',
    borderRadius: 5,
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#0a1a0f',
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

export interface EventCalendarProps {
    items: readonly EventViewItem[];
    /** Defaults to the current UTC month. */
    initialYear?: number;
    initialMonth?: number;
}

export const EventCalendar = ({
    items,
    initialYear,
    initialMonth,
}: EventCalendarProps): JSX.Element => {
    const today = new Date();
    const [cursor, setCursor] = useState({
        year: initialYear ?? today.getUTCFullYear(),
        month: initialMonth ?? today.getUTCMonth(),
    });

    const grid = useMemo(
        () => buildMonthGrid(items, cursor.year, cursor.month),
        [items, cursor.year, cursor.month]
    );

    const step = (delta: number) => {
        setCursor((prev) => {
            const next = prev.month + delta;
            const year = prev.year + Math.floor(next / 12);
            const month = ((next % 12) + 12) % 12;
            return { year, month };
        });
    };

    return (
        <div data-testid="event-calendar">
            <div style={headerStyle}>
                <button
                    type="button"
                    style={navButtonStyle}
                    onClick={() => step(-1)}
                    aria-label="Previous month"
                >
                    ‹
                </button>
                <strong data-testid="event-calendar-label" style={{ fontSize: 15 }}>
                    {MONTHS[cursor.month]} {cursor.year}
                </strong>
                <button
                    type="button"
                    style={navButtonStyle}
                    onClick={() => step(1)}
                    aria-label="Next month"
                >
                    ›
                </button>
            </div>
            <div style={gridStyle}>
                {WEEKDAYS.map((label) => (
                    <div key={label} style={weekdayCellStyle}>
                        {label}
                    </div>
                ))}
                {grid.weeks.flat().map((cell) => (
                    <div
                        key={cell.date}
                        data-testid="event-calendar-day"
                        data-date={cell.date}
                        style={{
                            ...dayCellBase,
                            opacity: cell.inMonth ? 1 : 0.4,
                            background: cell.inMonth ? 'var(--bg-input, #0f172a)' : 'transparent',
                        }}
                    >
                        <span style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>
                            {cell.day}
                        </span>
                        {cell.events.map((event) => (
                            <Link
                                key={event.id}
                                to={buildEventDetailPath(event.roomId, event.eventId)}
                                style={eventPillStyle}
                                title={event.title}
                            >
                                {event.title}
                            </Link>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default EventCalendar;
