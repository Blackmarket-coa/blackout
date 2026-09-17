import React, { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { COALITION_ROLE_LABELS } from '@blackout/core';
import { fetchUserCoalitions, type UserCoalitionSummary } from '../coalitions/coalitionsClient';

const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '4px 10px',
    textDecoration: 'none',
};
const roleStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'var(--accent-primary, #1ABC9C)',
};
const driveStyle: CSSProperties = { fontSize: 11, color: 'var(--text-secondary)' };
const mutedStyle: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)' };

/**
 * The coalitions a user belongs to, with their role in each and the number of
 * active drives — the profile section that replaced "Top friends". Accepts a
 * Matrix id or a Blackout id; the server resolves either.
 */
export function ProfileCoalitions({ userId }: { userId: string }): React.ReactElement | null {
    const [rows, setRows] = useState<UserCoalitionSummary[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchUserCoalitions(userId)
            .then((result) => {
                if (!cancelled) {
                    setRows(result);
                    setLoaded(true);
                }
            })
            .catch(() => {
                if (!cancelled) setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    if (!loaded) return null;
    if (rows.length === 0) {
        return (
            <span style={mutedStyle} data-testid="profile-coalitions-empty">
                Not in any coalitions yet.
            </span>
        );
    }
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} data-testid="profile-coalitions">
            {rows.map((row) => (
                <Link
                    key={row.coalition.id}
                    to={`/coalitions/${encodeURIComponent(row.coalition.slug)}`}
                    style={chipStyle}
                    title={`${row.memberCount} members · ${row.activeCampaigns} active`}
                    data-testid="profile-coalition-chip"
                >
                    <span>{row.coalition.name}</span>
                    <span style={roleStyle}>{COALITION_ROLE_LABELS[row.role]}</span>
                    {row.activeCampaigns > 0 ? (
                        <span style={driveStyle}>
                            {row.activeCampaigns} active{' '}
                            {row.activeCampaigns === 1 ? 'drive' : 'drives'}
                        </span>
                    ) : null}
                </Link>
            ))}
        </div>
    );
}

export default ProfileCoalitions;
