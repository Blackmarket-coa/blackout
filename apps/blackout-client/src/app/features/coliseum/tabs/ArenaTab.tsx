import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useSetAtom } from 'jotai';
import {
    COLISEUM_TOPIC_CATEGORIES,
    challengeStatusLabel,
    type ColiseumMatch,
    type ColiseumTopicCategoryKey,
} from '@blackout/core';
import { coliseumTabAtom, selectedColiseumMatchIdAtom } from '../../../state/coliseum';
import { createColiseumMatch, fetchColiseumMatches } from '../coliseumMatchClient';

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
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
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
};

const inputStyle: CSSProperties = {
    padding: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
};

const primaryButton: CSSProperties = {
    padding: '8px 14px',
    border: '1px solid var(--accent-primary)',
    background: 'var(--accent-primary)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
};

const badgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    padding: '2px 8px',
    border: '1px solid var(--border-active)',
    color: 'var(--border-active)',
};

function EntryGate({ onEnter }: { onEnter: () => void }) {
    return (
        <div
            style={{
                ...cardStyle,
                alignItems: 'center',
                textAlign: 'center',
                gap: 14,
                padding: 28,
            }}
        >
            <h2 style={{ margin: 0, color: 'var(--accent-primary)', letterSpacing: 1 }}>
                THE COLISEUM
            </h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: 440 }}>
                Inside the arena, callouts and direct confrontation are the product — but every
                fight is structured, every claim accountable, and every match ends in a permanent
                public Brief. Conflict stays in the arena.
            </p>
            <button
                type="button"
                style={primaryButton}
                onClick={onEnter}
                data-testid="coliseum-arena-enter"
            >
                Enter the Arena
            </button>
        </div>
    );
}

function MatchRow({ match, onOpen }: { match: ColiseumMatch; onOpen: (id: string) => void }) {
    return (
        <article style={cardStyle} data-testid="coliseum-match-row" data-match-id={match.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={badgeStyle}>{match.status}</span>
                {match.domain ? <span style={badgeStyle}>{match.domain}</span> : null}
                <span style={{ flex: 1, fontWeight: 600 }}>{match.proposition}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {match.challengerId} vs{' '}
                {match.opponentId ?? (match.open ? 'Open challenge' : 'pending')}
            </div>
            <button
                type="button"
                style={{
                    ...primaryButton,
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-default)',
                }}
                onClick={() => onOpen(match.id)}
            >
                Open match
            </button>
        </article>
    );
}

export function ArenaTab() {
    const [entered, setEntered] = useState(false);
    const [matches, setMatches] = useState<ColiseumMatch[]>([]);
    const [proposition, setProposition] = useState('');
    const [opponentId, setOpponentId] = useState('');
    const [domain, setDomain] = useState<ColiseumTopicCategoryKey | ''>('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const setTab = useSetAtom(coliseumTabAtom);
    const setSelectedMatch = useSetAtom(selectedColiseumMatchIdAtom);

    const load = useCallback(() => {
        fetchColiseumMatches({ limit: 50 })
            .then((res) => setMatches(res.matches))
            .catch(() => setMatches([]));
    }, []);

    useEffect(() => {
        if (entered) load();
    }, [entered, load]);

    const openMatch = useCallback(
        (id: string) => {
            setSelectedMatch(id);
            setTab('match');
        },
        [setSelectedMatch, setTab]
    );

    const onCallout = useCallback(async () => {
        const text = proposition.trim();
        if (!text || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await createColiseumMatch({
                proposition: text,
                domain: domain || undefined,
                opponentId: opponentId.trim() || undefined,
                open: opponentId.trim().length === 0,
            });
            setProposition('');
            setOpponentId('');
            load();
            openMatch(res.match.id);
        } catch {
            setError('Could not issue the Callout. You may be within the 48-hour cool-down.');
        } finally {
            setBusy(false);
        }
    }, [proposition, opponentId, domain, busy, load, openMatch]);

    if (!entered)
        return (
            <div style={containerStyle}>
                <EntryGate onEnter={() => setEntered(true)} />
            </div>
        );

    return (
        <div style={containerStyle} data-testid="coliseum-arena-tab">
            <section style={cardStyle}>
                <strong style={{ letterSpacing: 0.5 }}>Issue a Callout</strong>
                <input
                    value={proposition}
                    onChange={(e) => setProposition(e.target.value)}
                    placeholder="The proposition you're fighting for…"
                    maxLength={500}
                    style={inputStyle}
                    data-testid="coliseum-callout-proposition"
                />
                <div style={{ display: 'flex', gap: 8 }}>
                    <select
                        value={domain}
                        onChange={(e) => setDomain(e.target.value as ColiseumTopicCategoryKey | '')}
                        style={{ ...inputStyle, flex: 1 }}
                    >
                        <option value="">Any domain</option>
                        {COLISEUM_TOPIC_CATEGORIES.map((cat) => (
                            <option key={cat.key} value={cat.key}>
                                {cat.label}
                            </option>
                        ))}
                    </select>
                    <input
                        value={opponentId}
                        onChange={(e) => setOpponentId(e.target.value)}
                        placeholder="Opponent @id (blank = Open Challenge)"
                        style={{ ...inputStyle, flex: 1 }}
                    />
                </div>
                <button
                    type="button"
                    style={primaryButton}
                    disabled={busy || proposition.trim().length === 0}
                    onClick={onCallout}
                >
                    {busy ? 'Issuing…' : 'Issue Callout'}
                </button>
                {error ? (
                    <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span>
                ) : null}
            </section>

            {matches.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>
                    No matches yet. Issue the first Callout.
                </p>
            ) : (
                matches.map((m) => <MatchRow key={m.id} match={m} onOpen={openMatch} />)
            )}
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Open challenge statuses are public: {challengeStatusLabel('seen')} and{' '}
                {challengeStatusLabel('declined')} are visible to everyone.
            </p>
        </div>
    );
}

export default ArenaTab;
