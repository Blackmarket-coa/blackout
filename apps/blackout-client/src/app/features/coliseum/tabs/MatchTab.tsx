import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import {
    COLISEUM_ROUND_KINDS,
    CRUCIBLE_QUESTIONS,
    POSITION_AXES,
    challengeStatusLabel,
    type ColiseumRoundChoice,
    type ColiseumRoundKind,
    type PositionSnapshot,
} from '@blackout/core';
import { selectedColiseumMatchIdAtom } from '../../../state/coliseum';
import { userIdAtom } from '../../../state/auth';
import {
    acceptColiseumMatch,
    castColiseumPosition,
    castColiseumRoundVote,
    castColiseumSynthesisVote,
    fetchColiseumMatch,
    mintColiseumVerdict,
    openColiseumCrucible,
    postColiseumFinalStatement,
    postColiseumRound,
    type MatchDetailResponse,
} from '../coliseumMatchClient';
import { VideoComposer, type VideoComposerSubmit } from '../VideoComposer';

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

/** The 2-axis Live Position Map: crowd agreement × certainty, plus placement. */
function PositionMap({
    position,
    onPlace,
}: {
    position?: PositionSnapshot;
    onPlace: (agree: boolean, certain: boolean) => void;
}) {
    const agree = position ? position.agreeShare : 0;
    const certainty = position ? position.certainty : 0;
    const size = 140;
    return (
        <section style={cardStyle} data-testid="coliseum-position-map">
            <strong style={{ letterSpacing: 0.5 }}>Live Position Map</strong>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div
                    style={{
                        position: 'relative',
                        width: size,
                        height: size,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-input)',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '50%',
                            borderTop: '1px dashed var(--border-default)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: '50%',
                            borderLeft: '1px dashed var(--border-default)',
                        }}
                    />
                    <div
                        data-testid="coliseum-position-dot"
                        style={{
                            position: 'absolute',
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: 'var(--accent-primary)',
                            // x = agreement, y = certainty (top = certain).
                            left: `calc(${(agree * 100).toFixed(1)}% - 6px)`,
                            top: `calc(${((1 - certainty) * 100).toFixed(1)}% - 6px)`,
                        }}
                    />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button type="button" style={button} onClick={() => onPlace(true, true)}>
                        {POSITION_AXES.agreement.positive} · {POSITION_AXES.confidence.positive}
                    </button>
                    <button type="button" style={button} onClick={() => onPlace(false, true)}>
                        {POSITION_AXES.agreement.negative} · {POSITION_AXES.confidence.positive}
                    </button>
                    <button type="button" style={button} onClick={() => onPlace(true, false)}>
                        {POSITION_AXES.agreement.positive} · {POSITION_AXES.confidence.negative}
                    </button>
                    <button type="button" style={button} onClick={() => onPlace(false, false)}>
                        {POSITION_AXES.agreement.negative} · {POSITION_AXES.confidence.negative}
                    </button>
                </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {(agree * 100).toFixed(0)}% agree · {(certainty * 100).toFixed(0)}% certain ·{' '}
                {position?.sampleSize ?? 0} placed
            </div>
        </section>
    );
}

export function MatchTab() {
    const matchId = useAtomValue(selectedColiseumMatchIdAtom);
    const viewerId = useAtomValue(userIdAtom);
    const [detail, setDetail] = useState<MatchDetailResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [roundKind, setRoundKind] = useState<ColiseumRoundKind>('opening');

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

    const onPostRound = useCallback(
        async (payload: VideoComposerSubmit) => {
            if (!matchId || !payload.media) return;
            await postColiseumRound(matchId, {
                kind: roundKind,
                body: payload.body,
                media: payload.media,
            }).catch(() => undefined);
            load();
        },
        [matchId, roundKind, load]
    );

    const onFinalStatement = useCallback(
        async (payload: VideoComposerSubmit) => {
            if (!matchId) return;
            await postColiseumFinalStatement(matchId, {
                body: payload.body,
                mediaMxc: payload.media?.mxc,
            }).catch(() => undefined);
            load();
        },
        [matchId, load]
    );

    const onPlace = useCallback(
        async (agree: boolean, certain: boolean) => {
            if (!matchId) return;
            await castColiseumPosition(matchId, { agree, certain }).catch(() => undefined);
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

    const { match, rounds, tallies, challengeStatus, brief, position } = detail;
    const tallyFor = (index: number) => tallies?.find((t) => t.roundIndex === index);
    const isFighter =
        !!viewerId && (match.challengerId === viewerId || match.opponentId === viewerId);
    const isLiveOrCrucible = match.status === 'live' || match.status === 'crucible';

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
                {match.status === 'live' && isFighter ? (
                    <article style={cardStyle} data-testid="coliseum-round-composer">
                        <strong style={{ fontSize: 13 }}>Post your round</strong>
                        <VideoComposer
                            onSubmit={onPostRound}
                            submitLabel="Post round"
                            bodyPlaceholder="Round notes (optional)…"
                            extraControls={
                                <select
                                    value={roundKind}
                                    onChange={(e) =>
                                        setRoundKind(e.target.value as ColiseumRoundKind)
                                    }
                                    style={{
                                        padding: 8,
                                        border: '1px solid var(--border-default)',
                                        background: 'var(--bg-input)',
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    {COLISEUM_ROUND_KINDS.map((k) => (
                                        <option key={k} value={k}>
                                            {k}
                                        </option>
                                    ))}
                                </select>
                            }
                        />
                    </article>
                ) : null}
            </section>

            {isLiveOrCrucible ? <PositionMap position={position} onPlace={onPlace} /> : null}

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
                    {isFighter ? (
                        <div
                            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                            data-testid="coliseum-final-statement"
                        >
                            <strong style={{ fontSize: 13 }}>Your final statement</strong>
                            <VideoComposer
                                onSubmit={onFinalStatement}
                                submitLabel="Submit final statement"
                                bodyPlaceholder="Your final word (up to 500 chars)…"
                                requireVideo={false}
                            />
                        </div>
                    ) : null}
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
