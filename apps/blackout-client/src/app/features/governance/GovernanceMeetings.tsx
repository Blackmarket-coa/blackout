import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { GovernanceMeetingPayload } from '@blackout/protocol';
import {
    cancelMeeting as cancelMeetingDefault,
    listMeetings as listMeetingsDefault,
    scheduleMeeting as scheduleMeetingDefault,
} from './governanceClient';

export interface GovernanceMeetingsProps {
    listMeetings?: typeof listMeetingsDefault;
    scheduleMeeting?: typeof scheduleMeetingDefault;
    cancelMeeting?: typeof cancelMeetingDefault;
}

const containerStyle: CSSProperties = { display: 'grid', gap: 16, padding: 16 };
const cardStyle: CSSProperties = {
    display: 'grid',
    gap: 8,
    padding: 12,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-surface)',
};
const fieldStyle: CSSProperties = { display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-secondary)' };

function nextHour(): string {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + 1);
    return date.toISOString().slice(0, 16);
}

function plusHour(iso: string): string {
    const date = new Date(iso);
    date.setHours(date.getHours() + 1);
    return date.toISOString().slice(0, 16);
}

function toIso(local: string): string {
    if (!local) return '';
    return new Date(local).toISOString();
}

export function GovernanceMeetings({
    listMeetings = listMeetingsDefault,
    scheduleMeeting = scheduleMeetingDefault,
    cancelMeeting = cancelMeetingDefault,
}: GovernanceMeetingsProps = {}) {
    const [meetings, setMeetings] = useState<GovernanceMeetingPayload[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const initialStart = nextHour();
    const [meetingId, setMeetingId] = useState('');
    const [title, setTitle] = useState('');
    const [agenda, setAgenda] = useState('');
    const [location, setLocation] = useState('');
    const [proposalId, setProposalId] = useState('');
    const [startsAt, setStartsAt] = useState(initialStart);
    const [endsAt, setEndsAt] = useState(plusHour(initialStart));

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await listMeetings();
            setMeetings(response.items);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load meetings.');
        } finally {
            setLoading(false);
        }
    }, [listMeetings]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setSubmitError(null);
            const id = meetingId.trim() || `meet-${Date.now()}`;
            if (!title.trim() || !startsAt || !endsAt) {
                setSubmitError('Title, starts at, and ends at are required.');
                return;
            }
            setPending(true);
            try {
                await scheduleMeeting({
                    meetingId: id,
                    title: title.trim(),
                    startsAt: toIso(startsAt),
                    endsAt: toIso(endsAt),
                    agenda: agenda.trim() || undefined,
                    location: location.trim() || undefined,
                    relatedProposalId: proposalId.trim() || undefined,
                    attendees: [],
                    status: 'scheduled',
                });
                setMeetingId('');
                setTitle('');
                setAgenda('');
                setLocation('');
                setProposalId('');
                await refresh();
            } catch (err) {
                setSubmitError(err instanceof Error ? err.message : 'Failed to schedule.');
            } finally {
                setPending(false);
            }
        },
        [agenda, endsAt, location, meetingId, proposalId, refresh, scheduleMeeting, startsAt, title],
    );

    const onCancel = useCallback(
        async (id: string) => {
            try {
                await cancelMeeting(id);
                await refresh();
            } catch {
                /* refresh anyway so the user sees current state */
                await refresh();
            }
        },
        [cancelMeeting, refresh],
    );

    return (
        <main style={containerStyle} data-testid="governance-meetings">
            <header>
                <h1 style={{ margin: 0 }}>Governance Meetings</h1>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                    Schedule, cancel, and review governance meetings.
                </p>
            </header>

            <form
                style={cardStyle}
                onSubmit={(event) => {
                    void onSubmit(event);
                }}
                data-testid="governance-meetings-form"
            >
                <strong>New meeting</strong>
                <label style={fieldStyle}>
                    Title
                    <input
                        data-testid="governance-meetings-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Quarterly town hall"
                        required
                    />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label style={fieldStyle}>
                        Starts at
                        <input
                            data-testid="governance-meetings-starts"
                            type="datetime-local"
                            value={startsAt}
                            onChange={(event) => setStartsAt(event.target.value)}
                            required
                        />
                    </label>
                    <label style={fieldStyle}>
                        Ends at
                        <input
                            data-testid="governance-meetings-ends"
                            type="datetime-local"
                            value={endsAt}
                            onChange={(event) => setEndsAt(event.target.value)}
                            required
                        />
                    </label>
                </div>
                <label style={fieldStyle}>
                    Agenda
                    <textarea
                        data-testid="governance-meetings-agenda"
                        value={agenda}
                        onChange={(event) => setAgenda(event.target.value)}
                        rows={3}
                    />
                </label>
                <label style={fieldStyle}>
                    Location (URL or matrix room alias)
                    <input
                        data-testid="governance-meetings-location"
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                    />
                </label>
                <label style={fieldStyle}>
                    Related proposal id
                    <input
                        data-testid="governance-meetings-proposal"
                        value={proposalId}
                        onChange={(event) => setProposalId(event.target.value)}
                        placeholder="optional"
                    />
                </label>
                <label style={fieldStyle}>
                    Meeting id (auto if blank)
                    <input
                        data-testid="governance-meetings-id"
                        value={meetingId}
                        onChange={(event) => setMeetingId(event.target.value)}
                    />
                </label>
                {submitError ? (
                    <p
                        role="alert"
                        data-testid="governance-meetings-error"
                        style={{ color: 'var(--danger)', fontSize: 12 }}
                    >
                        {submitError}
                    </p>
                ) : null}
                <button
                    type="submit"
                    data-testid="governance-meetings-submit"
                    disabled={pending}
                    style={{
                        alignSelf: 'flex-start',
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--accent-primary, #1ABC9C)',
                        background: 'var(--accent-primary, #1ABC9C)',
                        color: '#fff',
                        cursor: pending ? 'progress' : 'pointer',
                    }}
                >
                    {pending ? 'Scheduling…' : 'Schedule meeting'}
                </button>
            </form>

            <section style={{ display: 'grid', gap: 8 }}>
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <strong>Upcoming and past</strong>
                    <button type="button" onClick={() => void refresh()} disabled={loading}>
                        Refresh
                    </button>
                </header>
                {error ? (
                    <p role="alert" style={{ color: 'var(--danger)' }}>
                        {error}
                    </p>
                ) : null}
                {loading && meetings.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Loading meetings…</p>
                ) : meetings.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>No meetings scheduled yet.</p>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
                        {meetings.map((meeting) => (
                            <li
                                key={meeting.meetingId}
                                style={cardStyle}
                                data-testid={`governance-meetings-row-${meeting.meetingId}`}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                    }}
                                >
                                    <strong>{meeting.title}</strong>
                                    <span
                                        style={{
                                            fontSize: 12,
                                            color:
                                                meeting.status === 'cancelled'
                                                    ? 'var(--danger)'
                                                    : 'var(--text-secondary)',
                                        }}
                                    >
                                        {meeting.status}
                                    </span>
                                </div>
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    {new Date(meeting.startsAt).toLocaleString()} →{' '}
                                    {new Date(meeting.endsAt).toLocaleString()}
                                </small>
                                {meeting.agenda ? (
                                    <p style={{ margin: 0 }}>{meeting.agenda}</p>
                                ) : null}
                                {meeting.location ? (
                                    <small>📍 {meeting.location}</small>
                                ) : null}
                                {meeting.relatedProposalId ? (
                                    <small>↳ proposal {meeting.relatedProposalId}</small>
                                ) : null}
                                {meeting.status !== 'cancelled' ? (
                                    <button
                                        type="button"
                                        data-testid={`governance-meetings-cancel-${meeting.meetingId}`}
                                        onClick={() => void onCancel(meeting.meetingId)}
                                        style={{ alignSelf: 'flex-start' }}
                                    >
                                        Cancel meeting
                                    </button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}

export default GovernanceMeetings;
