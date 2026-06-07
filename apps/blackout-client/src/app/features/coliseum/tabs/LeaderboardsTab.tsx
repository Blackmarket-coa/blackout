import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
    LEADERBOARD_CATEGORIES,
    type LeaderboardCategory,
    type LeaderboardEntry,
} from '@blackout/core';
import { fetchLeaderboard } from '../challengesClient';

const CATEGORY_LABEL: Record<LeaderboardCategory, string> = {
    creators: 'Creators',
    coalitions: 'Coalitions',
    projects: 'Projects',
    challenges: 'Challenges',
};

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    height: '100%',
    minHeight: 0,
    overflowY: 'auto',
};

const chipStyle = (active: boolean): CSSProperties => ({
    fontSize: 12,
    padding: '4px 12px',
    borderRadius: 999,
    cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent-primary, #1ABC9C)' : 'var(--border-default, rgba(255,255,255,0.12))'}`,
    background: active ? 'var(--accent-primary, #1ABC9C)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary, #aaa)',
});

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
    background: 'var(--bg-input, rgba(0,0,0,0.15))',
};

export function LeaderboardsTab() {
    const [category, setCategory] = useState<LeaderboardCategory>('creators');
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback((cat: LeaderboardCategory) => {
        setLoading(true);
        fetchLeaderboard(cat)
            .then((res) => setEntries(res.entries))
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load(category);
    }, [category, load]);

    return (
        <div style={containerStyle} data-testid="coliseum-leaderboards">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {LEADERBOARD_CATEGORIES.map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        style={chipStyle(category === cat)}
                        aria-pressed={category === cat}
                        onClick={() => setCategory(cat)}
                    >
                        {CATEGORY_LABEL[cat]}
                    </button>
                ))}
            </div>

            {loading ? (
                <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>Loading…</span>
            ) : entries.length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>
                    Nothing ranked here yet.
                </span>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {entries.map((entry) => (
                        <div key={entry.id} style={rowStyle} data-testid="coliseum-leaderboard-row">
                            <span style={{ fontWeight: 700, width: 28, textAlign: 'right' }}>
                                {entry.rank}
                            </span>
                            <span style={{ flex: 1, fontWeight: 600 }}>{entry.title}</span>
                            {entry.subtitle ? (
                                <span style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)' }}>
                                    {entry.subtitle}
                                </span>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default LeaderboardsTab;
