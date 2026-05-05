import React, { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useAtom } from 'jotai';
import type { ColiseumStance, RankedColiseumArgument } from '@blackout/core';
import {
    useColiseumTopic,
    useColiseumVerdict,
} from '../hooks/useColiseumTopics';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../state/coliseum';
import ColiseumCitationChip from '../ColiseumCitationChip';
import {
    castColiseumVote as castColiseumVoteDefault,
    createColiseumArgument as createColiseumArgumentDefault,
    type CastColiseumVoteInput,
    type CreateColiseumArgumentInput,
} from '../coliseumClient';

export type DebateTabClient = {
    castColiseumVote: (input: CastColiseumVoteInput) => Promise<unknown>;
    createColiseumArgument: (input: CreateColiseumArgumentInput) => Promise<unknown>;
};

const defaultClient: DebateTabClient = {
    castColiseumVote: (input) => castColiseumVoteDefault(input),
    createColiseumArgument: (input) => createColiseumArgumentDefault(input),
};

const STANCES: ColiseumStance[] = ['for', 'against', 'nuance'];

const STANCE_LABEL: Record<ColiseumStance, string> = {
    for: 'For',
    against: 'Against',
    nuance: 'Nuance',
};

const STANCE_COLOR: Record<ColiseumStance, string> = {
    for: '#1ABC9C',
    against: '#E74C3C',
    nuance: '#F1C40F',
};

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 16,
};

const headerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 16,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
};

const stancePieStyle: CSSProperties = {
    display: 'flex',
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    background: 'var(--bg-input)',
};

const argumentCardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 16,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
};

const stanceTagStyle = (stance: ColiseumStance): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 10px',
    borderRadius: 999,
    background: `${STANCE_COLOR[stance]}1a`,
    color: STANCE_COLOR[stance],
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
});

const verdictStyle: CSSProperties = {
    padding: 16,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    borderRadius: 12,
    background: 'rgba(26, 188, 156, 0.08)',
};

function ArgumentCard({
    argument,
    isWinner,
    onVote,
    pendingDirection,
}: {
    argument: RankedColiseumArgument;
    isWinner: boolean;
    onVote: (argumentId: string, direction: 'up' | 'down') => Promise<void>;
    pendingDirection: 'up' | 'down' | null;
}) {
    return (
        <article
            style={{
                ...argumentCardStyle,
                outline: isWinner ? `2px solid ${STANCE_COLOR[argument.stance]}` : 'none',
            }}
            data-coliseum-argument-id={argument.id}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={stanceTagStyle(argument.stance)}>
                    {STANCE_LABEL[argument.stance]}
                </span>
                {isWinner ? (
                    <span style={{ fontSize: 12, color: 'var(--accent-primary, #1ABC9C)', fontWeight: 700 }}>
                        🏆 Winner
                    </span>
                ) : null}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {Math.round(argument.voteScore * 100)}% support · consensus{' '}
                    {Math.round(argument.nuanceScore * 100)}%
                </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {argument.authorId}
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{argument.body}</p>
            {argument.citations.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {argument.citations.map((citation, index) => (
                        <ColiseumCitationChip key={index} citation={citation} />
                    ))}
                </div>
            ) : null}
            <div
                style={{ display: 'flex', gap: 8, marginTop: 4 }}
                data-testid="coliseum-debate-vote-controls"
            >
                <button
                    type="button"
                    data-testid={`coliseum-vote-up-${argument.id}`}
                    onClick={() => void onVote(argument.id, 'up')}
                    disabled={pendingDirection !== null}
                    style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--border-default)',
                        background: 'transparent',
                        cursor: pendingDirection ? 'progress' : 'pointer',
                        color: 'var(--text-primary)',
                    }}
                >
                    {pendingDirection === 'up' ? 'Voting…' : '👍 Agree'}
                </button>
                <button
                    type="button"
                    data-testid={`coliseum-vote-down-${argument.id}`}
                    onClick={() => void onVote(argument.id, 'down')}
                    disabled={pendingDirection !== null}
                    style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--border-default)',
                        background: 'transparent',
                        cursor: pendingDirection ? 'progress' : 'pointer',
                        color: 'var(--text-primary)',
                    }}
                >
                    {pendingDirection === 'down' ? 'Voting…' : '👎 Disagree'}
                </button>
            </div>
        </article>
    );
}

function ArgumentComposer({
    topicId,
    onCreate,
}: {
    topicId: string;
    onCreate: (input: CreateColiseumArgumentInput) => Promise<void>;
}) {
    const [stance, setStance] = useState<ColiseumStance>('for');
    const [body, setBody] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const trimmed = body.trim();
            if (!trimmed) {
                setError('Argument body is required.');
                return;
            }
            setPending(true);
            setError(null);
            try {
                await onCreate({ topicId, stance, body: trimmed });
                setBody('');
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to post argument.');
            } finally {
                setPending(false);
            }
        },
        [body, onCreate, stance, topicId],
    );

    return (
        <form
            data-testid="coliseum-debate-composer"
            onSubmit={onSubmit}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 12,
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                background: 'var(--bg-surface)',
            }}
        >
            <strong style={{ fontSize: 13 }}>Add your argument</strong>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                Stance
                <select
                    data-testid="coliseum-debate-composer-stance"
                    value={stance}
                    onChange={(event) => setStance(event.target.value as ColiseumStance)}
                >
                    {STANCES.map((value) => (
                        <option key={value} value={value}>
                            {STANCE_LABEL[value]}
                        </option>
                    ))}
                </select>
            </label>
            <textarea
                data-testid="coliseum-debate-composer-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Make your case…"
                rows={3}
                style={{
                    padding: 8,
                    borderRadius: 8,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                }}
            />
            {error ? (
                <p
                    role="alert"
                    data-testid="coliseum-debate-composer-error"
                    style={{ margin: 0, color: 'var(--danger)', fontSize: 12 }}
                >
                    {error}
                </p>
            ) : null}
            <button
                type="submit"
                data-testid="coliseum-debate-composer-submit"
                disabled={pending}
                style={{
                    alignSelf: 'flex-start',
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--accent-primary, #1ABC9C)',
                    background: 'var(--accent-primary, #1ABC9C)',
                    color: '#fff',
                    cursor: pending ? 'progress' : 'pointer',
                }}
            >
                {pending ? 'Posting…' : 'Post argument'}
            </button>
        </form>
    );
}

function StancePie({ args }: { args: ReadonlyArray<RankedColiseumArgument> }) {
    const totals = useMemo(() => {
        const counts: Record<ColiseumStance, number> = { for: 0, against: 0, nuance: 0 };
        for (const arg of args) counts[arg.stance] += 1;
        const total = counts.for + counts.against + counts.nuance;
        if (total === 0) return null;
        return {
            for: (counts.for / total) * 100,
            against: (counts.against / total) * 100,
            nuance: (counts.nuance / total) * 100,
        };
    }, [args]);

    if (!totals) return null;

    return (
        <div style={stancePieStyle} aria-label="Stance distribution">
            <span style={{ width: `${totals.for}%`, background: STANCE_COLOR.for }} />
            <span style={{ width: `${totals.nuance}%`, background: STANCE_COLOR.nuance }} />
            <span style={{ width: `${totals.against}%`, background: STANCE_COLOR.against }} />
        </div>
    );
}

export function DebateTab({ client = defaultClient }: { client?: DebateTabClient } = {}) {
    const [selectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [, setTab] = useAtom(coliseumTabAtom);
    const {
        data: topicData,
        loading,
        error,
        refetch: refetchTopic,
    } = useColiseumTopic(selectedTopicId);
    const { data: verdictData, refetch: refetchVerdict } = useColiseumVerdict(selectedTopicId);
    const [pendingVotes, setPendingVotes] = useState<Record<string, 'up' | 'down' | null>>({});
    const [voteError, setVoteError] = useState<string | null>(null);

    const onVote = useCallback(
        async (argumentId: string, direction: 'up' | 'down') => {
            setVoteError(null);
            setPendingVotes((prev) => ({ ...prev, [argumentId]: direction }));
            try {
                await client.castColiseumVote({ argumentId, direction });
                refetchTopic();
                refetchVerdict();
            } catch (err) {
                setVoteError(err instanceof Error ? err.message : 'Vote failed.');
            } finally {
                setPendingVotes((prev) => ({ ...prev, [argumentId]: null }));
            }
        },
        [client, refetchTopic, refetchVerdict],
    );

    const onCreateArgument = useCallback(
        async (input: CreateColiseumArgumentInput) => {
            await client.createColiseumArgument(input);
            refetchTopic();
            refetchVerdict();
        },
        [client, refetchTopic, refetchVerdict],
    );

    if (!selectedTopicId) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                Pick a topic on the{' '}
                <button
                    type="button"
                    onClick={() => setTab('topics')}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary, #1ABC9C)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 'inherit',
                    }}
                >
                    Topics
                </button>{' '}
                tab to start the debate.
            </div>
        );
    }

    if (loading && !topicData) {
        return <div style={{ padding: 24 }}>Loading debate...</div>;
    }
    if (error) {
        return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    }
    if (!topicData) {
        return <div style={{ padding: 24 }}>Topic not found.</div>;
    }

    const { topic, arguments: args } = topicData;
    const winnerId = verdictData?.verdict?.winningArgumentId ?? null;
    const consensusIds = new Set(verdictData?.verdict?.consensusArgumentIds ?? []);

    return (
        <div style={containerStyle} data-testid="coliseum-debate">
            <header style={headerStyle}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{topic.title}</h2>
                <a
                    href={topic.newsAnchor.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13, color: 'var(--text-secondary)' }}
                >
                    📰 {topic.newsAnchor.headline}
                </a>
                <StancePie args={args} />
            </header>

            {verdictData?.verdict?.winningArgumentId ? (
                <section style={verdictStyle}>
                    <strong>Community verdict</strong>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Highest cross-cluster consensus among{' '}
                        {verdictData.verdict.consensusArgumentIds.length} broadly-endorsed
                        argument{verdictData.verdict.consensusArgumentIds.length === 1 ? '' : 's'}.
                    </div>
                </section>
            ) : null}

            <ArgumentComposer topicId={selectedTopicId} onCreate={onCreateArgument} />

            {voteError ? (
                <div
                    role="alert"
                    data-testid="coliseum-debate-vote-error"
                    style={{ padding: 8, color: 'var(--danger)', fontSize: 12 }}
                >
                    {voteError}
                </div>
            ) : null}

            {args.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--text-secondary)' }}>
                    No arguments yet. Be first to take a stance.
                </div>
            ) : (
                args.map((argument) => (
                    <ArgumentCard
                        key={argument.id}
                        argument={argument}
                        isWinner={
                            argument.id === winnerId || consensusIds.has(argument.id)
                                ? argument.id === winnerId
                                : false
                        }
                        onVote={onVote}
                        pendingDirection={pendingVotes[argument.id] ?? null}
                    />
                ))
            )}
        </div>
    );
}

export default DebateTab;
