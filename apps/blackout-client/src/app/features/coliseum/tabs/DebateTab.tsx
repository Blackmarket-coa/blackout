import React, { useMemo, type CSSProperties } from 'react';
import { useAtom } from 'jotai';
import type { ColiseumStance, RankedColiseumArgument } from '@blackout/core';
import {
    useColiseumTopic,
    useColiseumVerdict,
} from '../hooks/useColiseumTopics';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../state/bmc-coliseum';
import ColiseumCitationChip from '../ColiseumCitationChip';

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
}: {
    argument: RankedColiseumArgument;
    isWinner: boolean;
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
        </article>
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

export function DebateTab() {
    const [selectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [, setTab] = useAtom(coliseumTabAtom);
    const { data: topicData, loading, error } = useColiseumTopic(selectedTopicId);
    const { data: verdictData } = useColiseumVerdict(selectedTopicId);

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
                    />
                ))
            )}
        </div>
    );
}

export default DebateTab;
