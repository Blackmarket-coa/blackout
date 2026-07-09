import React, { useCallback, useEffect, useState } from 'react';
import {
    LEADERBOARD_CATEGORIES,
    type LeaderboardCategory,
    type LeaderboardEntry,
} from '@blackout/core';
import { fetchLeaderboard } from '../challengesClient';
import { EmptyState } from '../../../../../../../packages/ui/src/primitives';
import { cx } from '../components/cx';
import * as ui from '../components/coliseumUi.css';

const CATEGORY_LABEL: Record<LeaderboardCategory, string> = {
    creators: 'Creators',
    coalitions: 'Coalitions',
    projects: 'Projects',
    challenges: 'Challenges',
};

const MEDALS = ['🥇', '🥈', '🥉'] as const;

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
    const medal = MEDALS[entry.rank - 1];
    return (
        <div
            className={ui.card}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 16px' }}
            data-testid="coliseum-leaderboard-row"
        >
            <span
                style={{
                    width: 34,
                    flexShrink: 0,
                    textAlign: 'center',
                    fontSize: medal ? 20 : 14,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                }}
                aria-label={`Rank ${entry.rank}`}
            >
                {medal ?? entry.rank}
            </span>
            <div className={ui.authorLine} style={{ flex: 1 }}>
                <span className={ui.avatarCircle} aria-hidden>
                    {entry.title.slice(0, 1)}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span className={ui.authorName}>{entry.title}</span>
                    {entry.subtitle ? (
                        <span className={ui.authorMeta}>{entry.subtitle}</span>
                    ) : null}
                </div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                {entry.score}
            </span>
        </div>
    );
}

function RowSkeleton() {
    return <div className={ui.skeleton} style={{ height: 64 }} aria-hidden />;
}

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
        <div data-testid="coliseum-leaderboards" style={{ minHeight: '100%' }}>
            <div className={ui.chipRow} role="group" aria-label="Leaderboard category">
                {LEADERBOARD_CATEGORIES.map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        className={cx(category === cat ? ui.chipActive : ui.chip)}
                        aria-pressed={category === cat}
                        onClick={() => setCategory(cat)}
                    >
                        {CATEGORY_LABEL[cat]}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className={ui.feedColumn} aria-busy="true">
                    <RowSkeleton />
                    <RowSkeleton />
                    <RowSkeleton />
                </div>
            ) : entries.length === 0 ? (
                <EmptyState
                    title="Nothing ranked here yet"
                    description={`Activity in ${CATEGORY_LABEL[
                        category
                    ].toLowerCase()} will show up here as the community gets moving.`}
                />
            ) : (
                <div className={ui.feedColumn}>
                    {entries.map((entry) => (
                        <LeaderboardRow key={entry.id} entry={entry} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default LeaderboardsTab;
