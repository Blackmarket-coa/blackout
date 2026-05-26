import React, { useCallback, useState, type CSSProperties } from 'react';
import { RING_KINDS, RING_VISIBILITY, type RingKind, type RingVisibility } from '@blackout/core';
import { useCoalitionRings, useMyRingInvites } from '../hooks/useCoalitionFeed';
import { createRing, joinRing, respondToRingInvite } from '../coalitionClient';

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
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#04201b',
    fontWeight: 600,
    cursor: 'pointer',
};
const ghostButtonStyle: CSSProperties = { ...buttonStyle, background: 'transparent', color: 'var(--text-secondary)' };
const labelStyle: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 };
const rowStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

export default function RingsTab(): React.ReactElement {
    const { data, loading, error, refetch } = useCoalitionRings();
    const { data: invitesData, refetch: refetchInvites } = useMyRingInvites();
    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [kind, setKind] = useState<RingKind>('circle');
    const [visibility, setVisibility] = useState<RingVisibility>('public');
    const [busy, setBusy] = useState(false);

    const create = useCallback(async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            await createRing({ name: name.trim(), description: description.trim(), kind, visibility });
            setName('');
            setDescription('');
            setShowForm(false);
            refetch();
        } finally {
            setBusy(false);
        }
    }, [name, description, kind, visibility, refetch]);

    const toggleMembership = useCallback(
        async (id: string, leave: boolean) => {
            await joinRing(id, leave);
            refetch();
        },
        [refetch],
    );

    const respondInvite = useCallback(
        async (ringId: string, accept: boolean) => {
            await respondToRingInvite(ringId, accept);
            refetchInvites();
            refetch();
        },
        [refetch, refetchInvites],
    );

    const rings = data?.rings ?? [];
    const invites = invitesData?.invitations ?? [];

    return (
        <div style={containerStyle}>
            <div style={rowStyle}>
                <strong style={{ fontSize: 18 }}>Rings</strong>
                <button type="button" style={ghostButtonStyle} onClick={() => setShowForm((v) => !v)}>
                    {showForm ? 'Close' : 'New ring'}
                </button>
            </div>

            {showForm ? (
                <div style={cardStyle}>
                    <label style={labelStyle}>Name</label>
                    <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
                    <label style={labelStyle}>Description</label>
                    <textarea
                        style={{ ...inputStyle, minHeight: 56 }}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    <div style={rowStyle}>
                        <div>
                            <label style={labelStyle}>Kind</label>
                            <select
                                style={inputStyle}
                                value={kind}
                                onChange={(e) => setKind(e.target.value as RingKind)}
                            >
                                {RING_KINDS.map((k) => (
                                    <option key={k} value={k}>
                                        {k}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Visibility</label>
                            <select
                                style={inputStyle}
                                value={visibility}
                                onChange={(e) => setVisibility(e.target.value as RingVisibility)}
                            >
                                {RING_VISIBILITY.map((v) => (
                                    <option key={v} value={v}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button type="button" style={buttonStyle} onClick={create} disabled={busy}>
                            {busy ? 'Creating…' : 'Create ring'}
                        </button>
                    </div>
                </div>
            ) : null}

            {invites.length > 0 ? (
                <div style={cardStyle}>
                    <span style={labelStyle}>Pending invitations</span>
                    {invites.map((invite) => (
                        <div key={invite.id} style={rowStyle}>
                            <span style={{ flex: 1, fontSize: 14 }}>Invitation to a ring</span>
                            <button
                                type="button"
                                style={buttonStyle}
                                onClick={() => respondInvite(invite.ringId, true)}
                            >
                                Accept
                            </button>
                            <button
                                type="button"
                                style={ghostButtonStyle}
                                onClick={() => respondInvite(invite.ringId, false)}
                            >
                                Decline
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}

            {loading ? <span style={labelStyle}>Loading rings…</span> : null}
            {error ? <span style={{ color: 'var(--danger, #e74c3c)' }}>{error}</span> : null}
            {!loading && rings.length === 0 ? (
                <span style={labelStyle}>No rings yet. Start a circle, crew, or guild.</span>
            ) : null}

            {rings.map((ring) => (
                <div key={ring.id} style={cardStyle}>
                    <div style={rowStyle}>
                        <strong style={{ flex: 1 }}>{ring.name}</strong>
                        <span style={labelStyle}>{ring.kind}</span>
                        <span style={{ fontSize: 13 }}>{ring.memberCount} member(s)</span>
                    </div>
                    {ring.description ? <p style={{ margin: 0, fontSize: 14 }}>{ring.description}</p> : null}
                    <div style={rowStyle}>
                        <button type="button" style={buttonStyle} onClick={() => toggleMembership(ring.id, false)}>
                            Join
                        </button>
                        <button
                            type="button"
                            style={ghostButtonStyle}
                            onClick={() => toggleMembership(ring.id, true)}
                        >
                            Leave
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
