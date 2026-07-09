import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
    SUGGESTED_CHALLENGE_CATEGORIES,
    type ColiseumChallenge,
    type RankedChallengeEntry,
} from '@blackout/core';
import {
    createChallenge,
    fetchChallenge,
    fetchChallenges,
    submitEntry,
    voteForEntry,
} from '../challengesClient';
import { EmptyState } from '../../../../../../../packages/ui/src/primitives';
import { AuthorLine } from '../components/AuthorLine';
import * as ui from '../components/coliseumUi.css';

const inputStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'var(--bg-input, rgba(0,0,0,0.2))',
    color: 'var(--text-primary, #fff)',
    fontSize: 14,
};

const submitButtonStyle: CSSProperties = {
    padding: '8px 16px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

const MEDALS = ['🥇', '🥈', '🥉'] as const;

function rankLabel(rank: number): string {
    return MEDALS[rank - 1] ?? `#${rank}`;
}

function ChallengeCard({ challenge }: { challenge: ColiseumChallenge }) {
    const [open, setOpen] = useState(false);
    const [entries, setEntries] = useState<RankedChallengeEntry[]>([]);
    const [entryTitle, setEntryTitle] = useState('');
    const [busy, setBusy] = useState(false);

    const loadEntries = useCallback(() => {
        fetchChallenge(challenge.id)
            .then((res) => setEntries(res.entries))
            .catch(() => setEntries([]));
    }, [challenge.id]);

    useEffect(() => {
        if (open) loadEntries();
    }, [open, loadEntries]);

    const onEnter = useCallback(async () => {
        const title = entryTitle.trim();
        if (!title || busy) return;
        setBusy(true);
        try {
            await submitEntry(challenge.id, { title });
            setEntryTitle('');
            loadEntries();
        } finally {
            setBusy(false);
        }
    }, [challenge.id, entryTitle, busy, loadEntries]);

    const onVote = useCallback(async (entryId: string) => {
        const res = await voteForEntry(entryId);
        setEntries(res.entries);
    }, []);

    return (
        <article
            className={ui.card}
            data-testid="coliseum-challenge-card"
            data-challenge-id={challenge.id}
        >
            <div className={ui.cardHeaderRow}>
                <span className={ui.tagChip}>{challenge.category}</span>
                <span className={ui.tagChip} style={{ textTransform: 'uppercase' }}>
                    {challenge.status}
                </span>
            </div>
            <h3 className={ui.cardTitle}>{challenge.title}</h3>
            {challenge.description ? (
                <p className={ui.mutedText} style={{ margin: 0 }}>
                    {challenge.description}
                </p>
            ) : null}
            <AuthorLine userId={challenge.creatorId} timestamp={challenge.createdAt} />
            <div className={ui.actionRow}>
                <button
                    type="button"
                    className={ui.actionButton}
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                >
                    {open ? 'Hide entries' : 'View entries'}
                </button>
            </div>
            {open ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {challenge.status === 'open' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                value={entryTitle}
                                onChange={(event) => setEntryTitle(event.target.value)}
                                placeholder="Enter your attempt…"
                                style={inputStyle}
                                data-testid="coliseum-challenge-entry-input"
                            />
                            <button
                                type="button"
                                style={submitButtonStyle}
                                disabled={busy || entryTitle.trim().length === 0}
                                onClick={onEnter}
                            >
                                Enter
                            </button>
                        </div>
                    ) : null}
                    {entries.length === 0 ? (
                        <EmptyState
                            title="No entries yet"
                            description={
                                challenge.status === 'open'
                                    ? 'Be the first to enter your attempt.'
                                    : 'Nobody entered this challenge.'
                            }
                        />
                    ) : (
                        entries.map((entry) => (
                            <div
                                key={entry.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                                data-testid="coliseum-challenge-entry"
                            >
                                <span
                                    style={{
                                        width: 30,
                                        flexShrink: 0,
                                        textAlign: 'center',
                                        fontSize: entry.rank <= MEDALS.length ? 18 : 13,
                                        fontWeight: 700,
                                        color: 'var(--text-secondary, #aaa)',
                                    }}
                                    aria-label={`Rank ${entry.rank}`}
                                >
                                    {rankLabel(entry.rank)}
                                </span>
                                <div
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 2,
                                    }}
                                >
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                                        {entry.title}
                                    </span>
                                    <AuthorLine
                                        userId={entry.entrantId}
                                        timestamp={entry.createdAt}
                                    />
                                </div>
                                <span className={ui.mutedText}>{entry.votes} ▲</span>
                                <button
                                    type="button"
                                    className={ui.actionButton}
                                    onClick={() => onVote(entry.id)}
                                >
                                    Vote
                                </button>
                            </div>
                        ))
                    )}
                </div>
            ) : null}
        </article>
    );
}

export function ChallengesTab() {
    const [challenges, setChallenges] = useState<ColiseumChallenge[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState<string>(SUGGESTED_CHALLENGE_CATEGORIES[0]);
    const [busy, setBusy] = useState(false);

    const refetch = useCallback(() => {
        fetchChallenges()
            .then((res) => {
                setChallenges(res.challenges);
                setError(null);
            })
            .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Failed to load challenges')
            );
    }, []);

    useEffect(() => {
        refetch();
    }, [refetch]);

    const onCreate = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const trimmed = title.trim();
            if (!trimmed || busy) return;
            setBusy(true);
            try {
                await createChallenge({ title: trimmed, category });
                setTitle('');
                refetch();
            } finally {
                setBusy(false);
            }
        },
        [title, category, busy, refetch]
    );

    return (
        <div data-testid="coliseum-challenges" style={{ minHeight: '100%' }}>
            <div className={ui.feedColumn}>
                <form
                    onSubmit={onCreate}
                    style={{ display: 'flex', gap: 8 }}
                    data-testid="coliseum-challenge-composer"
                >
                    <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        style={{ ...inputStyle, flex: '0 0 auto' }}
                        aria-label="Challenge category"
                    >
                        {SUGGESTED_CHALLENGE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                    <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Start a challenge…"
                        style={inputStyle}
                        data-testid="coliseum-challenge-input"
                    />
                    <button
                        type="submit"
                        style={submitButtonStyle}
                        disabled={busy || title.trim().length === 0}
                    >
                        Create
                    </button>
                </form>

                {error ? (
                    <EmptyState
                        title="Couldn't load challenges"
                        description={error}
                        action={
                            <button type="button" className={ui.chipActive} onClick={refetch}>
                                Retry
                            </button>
                        }
                    />
                ) : null}
                {!error && challenges.length === 0 ? (
                    <EmptyState
                        title="No challenges yet"
                        description="Start the first one — grow food, launch a business, build something."
                    />
                ) : (
                    challenges.map((challenge) => (
                        <ChallengeCard key={challenge.id} challenge={challenge} />
                    ))
                )}
            </div>
        </div>
    );
}

export default ChallengesTab;
