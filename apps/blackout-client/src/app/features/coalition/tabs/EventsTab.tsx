import React, { useCallback, useMemo, useState, type CSSProperties } from 'react';
import {
    EVENT_CATEGORIES,
    EVENT_VISIBILITY,
    RECURRENCE_FREQUENCIES,
    RSVP_STATUSES,
    type EventCategory,
    type EventVisibility,
    type RecurrenceFrequency,
    type RsvpStatus,
} from '@blackout/core';
import EventLogistics from './EventLogistics';
import { useCoalitionEvents, type CoalitionScopeQuery } from '../hooks/useCoalitionFeed';
import {
    createCoalitionEvent,
    createEventDen,
    fetchCoalitionEvent,
    rsvpToEvent,
    type CoalitionEventSummary,
    type EventDetailResponse,
} from '../coalitionClient';

export interface EventsTabProps {
    scope: CoalitionScopeQuery;
}

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    height: '100%',
    minHeight: 0,
    overflowY: 'auto',
};
const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
};
const inputStyle: CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 14,
};
const buttonStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#04201b',
    fontWeight: 600,
    cursor: 'pointer',
};
const ghostButtonStyle: CSSProperties = {
    ...buttonStyle,
    background: 'transparent',
    color: 'var(--text-secondary)',
};
const labelStyle: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 };
const rowStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

function toIsoOrUndefined(local: string): string | undefined {
    if (!local) return undefined;
    const ms = Date.parse(local);
    return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

function formatWhen(iso?: string): string {
    if (!iso) return 'TBD';
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? 'TBD' : new Date(ms).toLocaleString();
}

const EMPTY_FORM = {
    title: '',
    description: '',
    latitude: '',
    longitude: '',
    address: '',
    startsAt: '',
    endsAt: '',
    category: 'community',
    visibility: 'public',
    recurrence: 'none',
    interval: '1',
    count: '',
};

export default function EventsTab({ scope }: EventsTabProps): React.ReactElement {
    const { data, loading, error, refetch } = useCoalitionEvents(scope);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [detail, setDetail] = useState<EventDetailResponse | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const events = useMemo<CoalitionEventSummary[]>(() => {
        const list = data?.events ?? [];
        return [...list].sort((a, b) => {
            const aMs = Date.parse(a.nextOccurrence?.startsAt ?? a.startsAt);
            const bMs = Date.parse(b.nextOccurrence?.startsAt ?? b.startsAt);
            return aMs - bMs;
        });
    }, [data]);

    const setField = useCallback(
        (key: keyof typeof EMPTY_FORM, value: string) =>
            setForm((prev) => ({ ...prev, [key]: value })),
        [],
    );

    const submit = useCallback(async () => {
        const startsAt = toIsoOrUndefined(form.startsAt);
        const latitude = Number.parseFloat(form.latitude);
        const longitude = Number.parseFloat(form.longitude);
        if (!form.title.trim() || !form.description.trim() || !startsAt) {
            setFormError('Title, description, and start time are required.');
            return;
        }
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
            setFormError('A valid latitude and longitude are required.');
            return;
        }
        setSubmitting(true);
        setFormError(null);
        try {
            await createCoalitionEvent({
                title: form.title.trim(),
                description: form.description.trim(),
                location: {
                    latitude,
                    longitude,
                    address: form.address.trim() || undefined,
                },
                startsAt,
                endsAt: toIsoOrUndefined(form.endsAt),
                category: form.category as EventCategory,
                visibility: form.visibility as EventVisibility,
                recurrence:
                    form.recurrence === 'none'
                        ? undefined
                        : {
                              frequency: form.recurrence as RecurrenceFrequency,
                              interval: Math.max(1, Number.parseInt(form.interval, 10) || 1),
                              count: form.count ? Number.parseInt(form.count, 10) : undefined,
                          },
            });
            setForm({ ...EMPTY_FORM });
            setShowForm(false);
            refetch();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not create event.');
        } finally {
            setSubmitting(false);
        }
    }, [form, refetch]);

    const openDetail = useCallback(async (id: string) => {
        setSelectedId(id);
        setDetail(null);
        try {
            setDetail(await fetchCoalitionEvent(id));
        } catch {
            setDetail(null);
        }
    }, []);

    const submitRsvp = useCallback(
        async (id: string, status: RsvpStatus) => {
            try {
                const result = await rsvpToEvent(id, status);
                setDetail((prev) =>
                    prev && prev.event.id === id ? { ...prev, rsvpSummary: result.rsvpSummary } : prev,
                );
                refetch();
            } catch {
                /* surfaced via refetch / no-op */
            }
        },
        [refetch],
    );

    const attachDen = useCallback(
        async (id: string) => {
            try {
                const result = await createEventDen(id);
                if (result.denId) {
                    setDetail((prev) =>
                        prev && prev.event.id === id
                            ? { ...prev, event: { ...prev.event, denId: result.denId } }
                            : prev,
                    );
                    refetch();
                }
            } catch {
                /* no-op */
            }
        },
        [refetch],
    );

    return (
        <div style={containerStyle}>
            <div style={rowStyle}>
                <strong style={{ fontSize: 18 }}>Events</strong>
                <button type="button" style={ghostButtonStyle} onClick={() => setShowForm((v) => !v)}>
                    {showForm ? 'Close' : 'New event'}
                </button>
            </div>

            {showForm ? (
                <div style={cardStyle}>
                    <label style={labelStyle}>Title</label>
                    <input
                        style={inputStyle}
                        value={form.title}
                        onChange={(e) => setField('title', e.target.value)}
                    />
                    <label style={labelStyle}>Description</label>
                    <textarea
                        style={{ ...inputStyle, minHeight: 64 }}
                        value={form.description}
                        onChange={(e) => setField('description', e.target.value)}
                    />
                    <div style={rowStyle}>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Latitude</label>
                            <input
                                style={{ ...inputStyle, width: '100%' }}
                                value={form.latitude}
                                onChange={(e) => setField('latitude', e.target.value)}
                                inputMode="decimal"
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Longitude</label>
                            <input
                                style={{ ...inputStyle, width: '100%' }}
                                value={form.longitude}
                                onChange={(e) => setField('longitude', e.target.value)}
                                inputMode="decimal"
                            />
                        </div>
                    </div>
                    <label style={labelStyle}>Address (optional)</label>
                    <input
                        style={inputStyle}
                        value={form.address}
                        onChange={(e) => setField('address', e.target.value)}
                    />
                    <div style={rowStyle}>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Starts</label>
                            <input
                                type="datetime-local"
                                style={{ ...inputStyle, width: '100%' }}
                                value={form.startsAt}
                                onChange={(e) => setField('startsAt', e.target.value)}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Ends (optional)</label>
                            <input
                                type="datetime-local"
                                style={{ ...inputStyle, width: '100%' }}
                                value={form.endsAt}
                                onChange={(e) => setField('endsAt', e.target.value)}
                            />
                        </div>
                    </div>
                    <div style={rowStyle}>
                        <div>
                            <label style={labelStyle}>Category</label>
                            <select
                                style={inputStyle}
                                value={form.category}
                                onChange={(e) => setField('category', e.target.value)}
                            >
                                {EVENT_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>
                                        {cat}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Visibility</label>
                            <select
                                style={inputStyle}
                                value={form.visibility}
                                onChange={(e) => setField('visibility', e.target.value)}
                            >
                                {EVENT_VISIBILITY.map((vis) => (
                                    <option key={vis} value={vis}>
                                        {vis}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Repeats</label>
                            <select
                                style={inputStyle}
                                value={form.recurrence}
                                onChange={(e) => setField('recurrence', e.target.value)}
                            >
                                <option value="none">does not repeat</option>
                                {RECURRENCE_FREQUENCIES.map((freq) => (
                                    <option key={freq} value={freq}>
                                        {freq}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {form.recurrence !== 'none' ? (
                            <div>
                                <label style={labelStyle}>Times (optional)</label>
                                <input
                                    style={{ ...inputStyle, width: 90 }}
                                    value={form.count}
                                    onChange={(e) => setField('count', e.target.value)}
                                    inputMode="numeric"
                                    placeholder="e.g. 8"
                                />
                            </div>
                        ) : null}
                    </div>
                    {formError ? (
                        <span style={{ color: 'var(--danger, #e74c3c)', fontSize: 13 }}>{formError}</span>
                    ) : null}
                    <div style={rowStyle}>
                        <button type="button" style={buttonStyle} onClick={submit} disabled={submitting}>
                            {submitting ? 'Creating…' : 'Create event'}
                        </button>
                    </div>
                </div>
            ) : null}

            {loading ? <span style={labelStyle}>Loading events…</span> : null}
            {error ? <span style={{ color: 'var(--danger, #e74c3c)' }}>{error}</span> : null}
            {!loading && events.length === 0 ? (
                <span style={labelStyle}>No events yet. Create the first one.</span>
            ) : null}

            {events.map((event) => {
                const isOpen = selectedId === event.id;
                const when = event.nextOccurrence?.startsAt ?? event.startsAt;
                return (
                    <div key={event.id} style={cardStyle}>
                        <div style={rowStyle}>
                            <strong style={{ flex: 1 }}>{event.title}</strong>
                            <span style={labelStyle}>{event.category}</span>
                            {event.status === 'cancelled' ? (
                                <span style={{ color: 'var(--danger, #e74c3c)', fontSize: 12 }}>
                                    cancelled
                                </span>
                            ) : (
                                <span style={labelStyle}>{event.nextOccurrence?.status ?? 'past'}</span>
                            )}
                        </div>
                        <span style={labelStyle}>{formatWhen(when)}</span>
                        <span style={{ fontSize: 13 }}>
                            Going {event.rsvpSummary.going} · Maybe {event.rsvpSummary.maybe}
                        </span>
                        <div style={rowStyle}>
                            <button
                                type="button"
                                style={ghostButtonStyle}
                                onClick={() => (isOpen ? setSelectedId(null) : openDetail(event.id))}
                            >
                                {isOpen ? 'Hide details' : 'Details'}
                            </button>
                        </div>
                        {isOpen ? (
                            <div style={{ ...cardStyle, background: 'var(--bg-input)' }}>
                                <p style={{ margin: 0, fontSize: 14 }}>{event.description}</p>
                                <div style={rowStyle}>
                                    {RSVP_STATUSES.map((status) => (
                                        <button
                                            key={status}
                                            type="button"
                                            style={buttonStyle}
                                            onClick={() => submitRsvp(event.id, status)}
                                        >
                                            {status}
                                        </button>
                                    ))}
                                </div>
                                {event.denId ? (
                                    <span style={labelStyle}>Den: {event.denId}</span>
                                ) : (
                                    <button
                                        type="button"
                                        style={ghostButtonStyle}
                                        onClick={() => attachDen(event.id)}
                                    >
                                        Create after-event den
                                    </button>
                                )}
                                {detail && detail.event.id === event.id ? (
                                    <div>
                                        <span style={labelStyle}>Upcoming dates</span>
                                        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
                                            {detail.occurrences.slice(0, 6).map((occ) => (
                                                <li key={occ.index}>{formatWhen(occ.startsAt)}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                                <EventLogistics eventId={event.id} />
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
