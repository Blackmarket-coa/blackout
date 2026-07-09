import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { CRUCIBLE_QUESTIONS, challengeStatusLabel, type ColiseumRoundChoice } from '@blackout/core';
import { EmptyState } from '../../../../../../../packages/ui/src/primitives';
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
import * as ui from '../components/coliseumUi.css';

const RED = 'var(--accent-primary, #E74C3C)';
const BLUE = 'var(--border-active, #3498DB)';

const fighterCard: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '12px 8px',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 14,
    minWidth: 0,
    textAlign: 'center',
    overflowWrap: 'anywhere',
};

const redFighter: CSSProperties = {
    ...fighterCard,
    color: RED,
    border: `1px solid ${RED}`,
    background: `color-mix(in srgb, ${RED} 10%, transparent)`,
};

const blueFighter: CSSProperties = {
    ...fighterCard,
    color: BLUE,
    border: `1px solid ${BLUE}`,
    background: `color-mix(in srgb, ${BLUE} 10%, transparent)`,
};

const pillButton: CSSProperties = {
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    alignSelf: 'flex-start',
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
            <div className={ui.feedColumn}>
                <EmptyState
                    title="No match selected"
                    description="Pick a match in the Arena to watch it here."
                />
            </div>
        );
    }
    if (error)
        return (
            <div className={ui.feedColumn}>
                <EmptyState title="Couldn't load this match" description={error} />
            </div>
        );
    if (!detail)
        return (
            <div className={ui.feedColumn} aria-busy="true">
                <div className={ui.skeleton} style={{ height: 140 }} aria-hidden />
                <div className={ui.skeleton} style={{ height: 120 }} aria-hidden />
                <div className={ui.skeleton} style={{ height: 120 }} aria-hidden />
            </div>
        );

    const { match, rounds, tallies, challengeStatus, brief } = detail;
    const tallyFor = (index: number) => tallies?.find((t) => t.roundIndex === index);

    return (
        <div
            data-testid="coliseum-match-tab"
            data-match-id={match.id}
            style={{ minHeight: '100%' }}
        >
            <div className={ui.feedColumn}>
                <header className={ui.card}>
                    <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
                        <div style={redFighter}>
                            <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>
                                🔴
                            </span>
                            {match.challengerId}
                        </div>
                        <span
                            aria-hidden
                            style={{
                                alignSelf: 'center',
                                fontSize: 12,
                                fontWeight: 800,
                                letterSpacing: 1,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            VS
                        </span>
                        <div style={blueFighter}>
                            <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>
                                🔵
                            </span>
                            {match.opponentId ?? 'Open'}
                        </div>
                    </div>
                    <h2 className={ui.cardTitle}>{match.proposition}</h2>
                    <span className={ui.mutedText}>
                        Status: {match.status} · Challenge: {challengeStatusLabel(challengeStatus)}
                    </span>
                    {match.status === 'pending' ? (
                        <button
                            type="button"
                            style={pillButton}
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
                            style={pillButton}
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
                </header>

                <h3 className={ui.sectionTitle}>Rounds</h3>
                {rounds.length === 0 ? (
                    <EmptyState
                        title="No rounds posted yet"
                        description="The fighters haven't traded blows — rounds land here as soon as they do."
                    />
                ) : null}
                {rounds.map((round) => {
                    const tally = tallyFor(round.index);
                    return (
                        <article key={round.id} className={ui.card} data-testid="coliseum-round">
                            <div className={ui.cardHeaderRow}>
                                <span className={ui.tagChip} style={{ textTransform: 'uppercase' }}>
                                    Round {round.index + 1}
                                </span>
                                <span className={ui.tagChip}>{round.kind}</span>
                                <span aria-hidden>{round.side === 'red' ? '🔴' : '🔵'}</span>
                            </div>
                            {round.body ? (
                                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
                                    {round.body}
                                </p>
                            ) : null}
                            <div className={ui.actionRow}>
                                <button
                                    type="button"
                                    className={ui.actionButton}
                                    style={{ color: RED, fontWeight: 700 }}
                                    onClick={() => void onRoundVote(round.index, 'red')}
                                >
                                    Red
                                </button>
                                <button
                                    type="button"
                                    className={ui.actionButton}
                                    onClick={() => void onRoundVote(round.index, 'draw')}
                                >
                                    Draw
                                </button>
                                <button
                                    type="button"
                                    className={ui.actionButton}
                                    style={{ color: BLUE, fontWeight: 700 }}
                                    onClick={() => void onRoundVote(round.index, 'blue')}
                                >
                                    Blue
                                </button>
                                {tally ? (
                                    <span className={ui.mutedText} style={{ marginLeft: 'auto' }}>
                                        🔴 {tally.red} · {tally.draw} · {tally.blue} 🔵
                                    </span>
                                ) : (
                                    <span
                                        className={ui.mutedText}
                                        style={{ marginLeft: 'auto', fontSize: 11 }}
                                    >
                                        Tallies hidden (you argue blind)
                                    </span>
                                )}
                            </div>
                        </article>
                    );
                })}

                {match.status === 'crucible' ? (
                    <section className={ui.card} data-testid="coliseum-crucible">
                        <h3 className={ui.sectionTitle}>The Crucible</h3>
                        {CRUCIBLE_QUESTIONS.map((q) => (
                            <div
                                key={q.id}
                                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                            >
                                <span style={{ fontSize: 14, fontWeight: 600 }}>{q.prompt}</span>
                                <div className={ui.actionRow}>
                                    <button
                                        type="button"
                                        className={ui.actionButton}
                                        style={{ color: RED, fontWeight: 700 }}
                                        onClick={() => void onSynthesis(q.id, 'red')}
                                    >
                                        Red
                                    </button>
                                    <button
                                        type="button"
                                        className={ui.actionButton}
                                        style={{ color: BLUE, fontWeight: 700 }}
                                        onClick={() => void onSynthesis(q.id, 'blue')}
                                    >
                                        Blue
                                    </button>
                                    <button
                                        type="button"
                                        className={ui.actionButton}
                                        onClick={() => void onSynthesis(q.id, 'neither')}
                                    >
                                        Neither
                                    </button>
                                    <button
                                        type="button"
                                        className={ui.actionButton}
                                        onClick={() => void onSynthesis(q.id, 'both')}
                                    >
                                        Both
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button
                            type="button"
                            style={pillButton}
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
                    <section
                        className={ui.card}
                        style={{
                            borderColor: BLUE,
                            background: `color-mix(in srgb, ${BLUE} 6%, transparent)`,
                        }}
                        data-testid="coliseum-brief"
                    >
                        <h3 className={ui.sectionTitle} style={{ color: BLUE }}>
                            Coliseum Brief
                        </h3>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>
                            Winner:{' '}
                            {brief.winner
                                ? brief.winner === 'red'
                                    ? '🔴 Red'
                                    : '🔵 Blue'
                                : 'Draw'}
                        </span>
                        <span className={ui.mutedText}>
                            Shift Score: {(brief.shiftScore * 100).toFixed(0)}%
                        </span>
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
        </div>
    );
}

export default MatchTab;
