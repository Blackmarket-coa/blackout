import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { CRUCIBLE_QUESTIONS, challengeStatusLabel, type ColiseumRoundChoice } from '@blackout/core';
import { selectedColiseumMatchIdAtom } from '../../../state/coliseum';
import {
    acceptColiseumMatch,
    castColiseumRoundVote,
    castColiseumSynthesisVote,
    fetchColiseumMatch,
    mintColiseumVerdict,
    openColiseumCrucible,
    type MatchDetailResponse,
} from '../coliseumMatchClient';

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

const button: CSSProperties = {
    padding: '6px 12px',
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
};

const redButton: CSSProperties = {
    ...button,
    borderColor: 'var(--accent-primary)',
    color: 'var(--accent-primary)',
};
const blueButton: CSSProperties = {
    ...button,
    borderColor: 'var(--border-active)',
    color: 'var(--border-active)',
};

export function MatchTab() {
    const matchId = useAtomValue(selectedColiseumMatchIdAtom);
    const [detail, setDetail] = useState<MatchDetailResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        if (!matchId) return;
        fetchColiseumMatch(matchId)
            .then(setDetail)
            .catch(() => setError('Could not load this match.'));
    }, [matchId]);

    useEffect(() => {
        load();
    }, [load]);

    const onRoundVote = useCallback(
        async (roundIndex: number, choice: ColiseumRoundChoice) => {
            if (!matchId) return;
            try {
                await castColiseumRoundVote(matchId, roundIndex, choice);
                load();
            } catch {
                /* a fighter cannot vote on their own match */
            }
        },
        [matchId, load]
    );

    const onSynthesis = useCallback(
        async (questionId: string, choice: 'red' | 'blue' | 'neither' | 'both') => {
            if (!matchId) return;
            await castColiseumSynthesisVote(matchId, questionId, choice).catch(() => undefined);
            load();
        },
        [matchId, load]
    );

    if (!matchId) {
        return (
            <div style={containerStyle}>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Pick a match in the Arena to watch it here.
                </p>
            </div>
        );
    }
    if (error)
        return (
            <div style={containerStyle}>
                <p style={{ color: 'var(--danger)' }}>{error}</p>
            </div>
        );
    if (!detail)
        return (
            <div style={containerStyle}>
                <p>Loading match…</p>
            </div>
        );

    const { match, rounds, tallies, challengeStatus, brief } = detail;
    const tallyFor = (index: number) => tallies?.find((t) => t.roundIndex === index);

    return (
        <div style={containerStyle} data-testid="coliseum-match-tab" data-match-id={match.id}>
            <section style={cardStyle}>
                <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1, color: 'var(--accent-primary)', fontWeight: 700 }}>
                        🔴 {match.challengerId}
                    </div>
                    <div
                        style={{
                            flex: 1,
                            textAlign: 'right',
                            color: 'var(--border-active)',
                            fontWeight: 700,
                        }}
                    >
                        {match.opponentId ?? 'Open'} 🔵
                    </div>
                </div>
                <strong style={{ fontSize: 16 }}>{match.proposition}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Status: {match.status} · Challenge: {challengeStatusLabel(challengeStatus)}
                </div>
                {match.status === 'pending' ? (
                    <button
                        type="button"
                        style={redButton}
                        onClick={() =>
                            matchId &&
                            acceptColiseumMatch(matchId)
                                .then(load)
                                .catch(() => undefined)
                        }
                    >
                        Accept challenge
                    </button>
                ) : null}
                {match.status === 'live' ? (
                    <button
                        type="button"
                        style={button}
                        onClick={() =>
                            matchId &&
                            openColiseumCrucible(matchId)
                                .then(load)
                                .catch(() => undefined)
                        }
                    >
                        Open the Crucible
                    </button>
                ) : null}
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <strong style={{ letterSpacing: 0.5 }}>Rounds</strong>
                {rounds.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>No rounds posted yet.</p>
                ) : null}
                {rounds.map((round) => {
                    const tally = tallyFor(round.index);
                    return (
                        <article key={round.id} style={cardStyle} data-testid="coliseum-round">
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                Round {round.index + 1} · {round.kind} ·{' '}
                                {round.side === 'red' ? '🔴' : '🔵'}
                            </div>
                            {round.body ? <p style={{ margin: 0 }}>{round.body}</p> : null}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <button
                                    type="button"
                                    style={redButton}
                                    onClick={() => onRoundVote(round.index, 'red')}
                                >
                                    Red
                                </button>
                                <button
                                    type="button"
                                    style={button}
                                    onClick={() => onRoundVote(round.index, 'draw')}
                                >
                                    Draw
                                </button>
                                <button
                                    type="button"
                                    style={blueButton}
                                    onClick={() => onRoundVote(round.index, 'blue')}
                                >
                                    Blue
                                </button>
                                {tally ? (
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        🔴 {tally.red} · {tally.draw} · {tally.blue} 🔵
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        Tallies hidden (you argue blind)
                                    </span>
                                )}
                            </div>
                        </article>
                    );
                })}
            </section>

            {match.status === 'crucible' ? (
                <section style={cardStyle} data-testid="coliseum-crucible">
                    <strong>The Crucible</strong>
                    {CRUCIBLE_QUESTIONS.map((q) => (
                        <div
                            key={q.id}
                            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                        >
                            <span style={{ fontSize: 13 }}>{q.prompt}</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    type="button"
                                    style={redButton}
                                    onClick={() => onSynthesis(q.id, 'red')}
                                >
                                    Red
                                </button>
                                <button
                                    type="button"
                                    style={blueButton}
                                    onClick={() => onSynthesis(q.id, 'blue')}
                                >
                                    Blue
                                </button>
                                <button
                                    type="button"
                                    style={button}
                                    onClick={() => onSynthesis(q.id, 'neither')}
                                >
                                    Neither
                                </button>
                                <button
                                    type="button"
                                    style={button}
                                    onClick={() => onSynthesis(q.id, 'both')}
                                >
                                    Both
                                </button>
                            </div>
                        </div>
                    ))}
                    <button
                        type="button"
                        style={{ ...redButton, fontWeight: 700 }}
                        onClick={() =>
                            matchId &&
                            mintColiseumVerdict(matchId)
                                .then(load)
                                .catch(() => undefined)
                        }
                    >
                        Drop the Verdict
                    </button>
                </section>
            ) : null}

            {brief ? (
                <section style={cardStyle} data-testid="coliseum-brief">
                    <strong style={{ color: 'var(--border-active)' }}>Coliseum Brief</strong>
                    <div>
                        Winner:{' '}
                        {brief.winner ? (brief.winner === 'red' ? '🔴 Red' : '🔵 Blue') : 'Draw'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Shift Score: {(brief.shiftScore * 100).toFixed(0)}%
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                        {brief.questionBreakdown.map((b) => (
                            <li key={b.questionId}>
                                {b.prompt} — <strong>{b.winner}</strong>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}

export default MatchTab;
