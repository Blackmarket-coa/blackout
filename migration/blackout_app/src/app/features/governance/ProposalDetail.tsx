import { useMemo, useState } from 'react';
import { useCastVote, useProposalResult, useVotes } from './useProposals';

export const ProposalDetail = ({
    roomId,
    proposalId,
    currentUserId,
    anonymousMode = false,
}: {
    roomId: string;
    proposalId: string;
    currentUserId: string;
    anonymousMode?: boolean;
}) => {
    const castVote = useCastVote(roomId);
    const result = useProposalResult(proposalId, roomId);
    const votes = useVotes(proposalId, roomId);

    const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const proposal = result.data?.proposal;
    const optionResults = result.data?.optionResults ?? [];
    const maxCount = Math.max(1, ...optionResults.map((option) => option.count));

    const myVote = useMemo(
        () => votes.data.find((vote) => vote.voterId === currentUserId) ?? null,
        [currentUserId, votes.data],
    );

    if (!proposal) {
        return (
            <section style={{ padding: 12, color: 'var(--text-secondary)' }}>
                Proposal not found.
            </section>
        );
    }

    const toggleChoice = (optionId: string) => {
        setSelectedChoices((prev) => {
            const selected = prev.includes(optionId);

            if (proposal.type === 'binary') {
                return selected ? [] : [optionId];
            }

            if (proposal.type === 'multiple_choice') {
                return selected ? prev.filter((item) => item !== optionId) : [...prev, optionId];
            }

            return selected ? prev.filter((item) => item !== optionId) : [...prev, optionId];
        });
    };

    const submitVote = async () => {
        if (selectedChoices.length === 0) return;

        setSubmitting(true);
        try {
            await castVote({
                proposalEventId: proposal.proposalEventId,
                choice: proposal.type === 'binary' ? selectedChoices[0] : selectedChoices,
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header style={{ display: 'grid', gap: 4 }}>
                <h2 style={{ margin: 0 }}>{proposal.title}</h2>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    Status: {result.data?.computedStatus} • Votes: {result.data?.voteCount ?? 0}/
                    {proposal.quorum}
                </div>
            </header>

            <article
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    padding: 12,
                }}
            >
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', font: 'inherit' }}>
                    {proposal.description}
                </pre>
            </article>

            <section
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                }}
            >
                <strong>Cast your vote</strong>

                <div style={{ display: 'grid', gap: 6 }}>
                    {proposal.options.map((option) => {
                        const selected = selectedChoices.includes(option.id);
                        return (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => toggleChoice(option.id)}
                                style={{
                                    border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                    borderRadius: 10,
                                    background: selected
                                        ? 'var(--accent-muted)'
                                        : 'var(--bg-input)',
                                    color: 'var(--text-primary)',
                                    textAlign: 'left',
                                    padding: '8px 10px',
                                }}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {myVote
                            ? `Current vote: ${typeof myVote.choice === 'string' ? myVote.choice : myVote.choice.join(', ')}`
                            : 'No vote cast yet'}
                    </span>
                    <button
                        type="button"
                        onClick={() => void submitVote()}
                        disabled={
                            selectedChoices.length === 0 ||
                            submitting ||
                            proposal.status !== 'active'
                        }
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--accent-primary)',
                            color: 'var(--bg-surface)',
                            padding: '6px 10px',
                        }}
                    >
                        {submitting ? 'Submitting…' : myVote ? 'Change Vote' : 'Cast Vote'}
                    </button>
                </div>
            </section>

            <section
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                }}
            >
                <strong>Results</strong>

                <div style={{ display: 'grid', gap: 8 }}>
                    {proposal.options.map((option) => {
                        const resultItem = optionResults.find(
                            (item) => item.optionId === option.id,
                        );
                        const count = resultItem?.count ?? 0;
                        const width = (count / maxCount) * 100;

                        return (
                            <div key={option.id} style={{ display: 'grid', gap: 4 }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: 12,
                                    }}
                                >
                                    <span>{option.label}</span>
                                    <span>{count}</span>
                                </div>
                                <div
                                    style={{
                                        height: 8,
                                        borderRadius: 999,
                                        background: 'var(--bg-input)',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: `${width}%`,
                                            height: '100%',
                                            background: 'var(--accent-primary)',
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                }}
            >
                <strong>Voters</strong>
                {anonymousMode ? (
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        Anonymous mode enabled.
                    </span>
                ) : (
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)' }}>
                        {votes.data.map((vote) => (
                            <li key={vote.eventId}>
                                {vote.voterId} →{' '}
                                {typeof vote.choice === 'string'
                                    ? vote.choice
                                    : vote.choice.join(', ')}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </section>
    );
};

export default ProposalDetail;
