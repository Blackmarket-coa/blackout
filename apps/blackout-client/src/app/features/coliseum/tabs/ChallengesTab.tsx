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
    gap: 8,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'var(--bg-surface, rgba(255,255,255,0.03))',
};

const inputStyle: CSSProperties = {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'var(--bg-input, rgba(0,0,0,0.2))',
    color: 'var(--text-primary, #fff)',
};

const badgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    color: 'var(--text-secondary, #aaa)',
};

const buttonStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    cursor: 'pointer',
};

const ghostButtonStyle: CSSProperties = {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'transparent',
    color: 'var(--text-primary, #fff)',
    cursor: 'pointer',
    fontSize: 12,
};

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

    const onVote = useCallback(
        async (entryId: string) => {
            const res = await voteForEntry(entryId);
            setEntries(res.entries);
        },
        [],
    );

    return (
        <article style={cardStyle} data-testid="coliseum-challenge-card" data-challenge-id={challenge.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={badgeStyle}>{challenge.category}</span>
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{challenge.title}</span>
                <span style={badgeStyle}>{challenge.status}</span>
            </div>
            {challenge.description ? (
                <p style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)', margin: 0 }}>
                    {challenge.description}
                </p>
            ) : null}
            <button type="button" style={ghostButtonStyle} onClick={() => setOpen((v) => !v)}>
                {open ? 'Hide entries' : 'View entries'}
            </button>
            {open ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                                style={buttonStyle}
                                disabled={busy || entryTitle.trim().length === 0}
                                onClick={onEnter}
                            >
                                Enter
                            </button>
                        </div>
                    ) : null}
                    {entries.length === 0 ? (
                        <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>
                            No entries yet.
                        </span>
                    ) : (
                        entries.map((entry) => (
                            <div
                                key={entry.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                data-testid="coliseum-challenge-entry"
                            >
                                <span style={badgeStyle}>#{entry.rank}</span>
                                <span style={{ flex: 1, fontSize: 14 }}>{entry.title}</span>
                                <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>
                                    {entry.votes} ▲
                                </span>
                                <button
                                    type="button"
                                    style={ghostButtonStyle}
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
                setError(err instanceof Error ? err.message : 'Failed to load challenges'),
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
        [title, category, busy, refetch],
    );

    return (
        <div style={containerStyle} data-testid="coliseum-challenges">
            <form onSubmit={onCreate} style={{ display: 'flex', gap: 8 }} data-testid="coliseum-challenge-composer">
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
                <button type="submit" style={buttonStyle} disabled={busy || title.trim().length === 0}>
                    Create
                </button>
            </form>

            {error ? <div style={{ color: 'var(--danger, #e74c3c)', fontSize: 13 }}>{error}</div> : null}
            {challenges.length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>
                    No challenges yet. Start the first one.
                </span>
            ) : (
                challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)
            )}
        </div>
    );
}

export default ChallengesTab;
