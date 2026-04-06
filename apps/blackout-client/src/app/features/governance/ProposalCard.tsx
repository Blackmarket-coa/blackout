import { useMemo } from 'react';
import { useVotes, type ProposalModel, type VoteModel } from './useProposals';

const statusColor: Record<ProposalModel['status'], string> = {
    active: '#3B82F6',
    passed: '#10B981',
    failed: '#EF4444',
    cancelled: '#6B7280',
};

const timeRemainingLabel = (deadline: string): string => {
    const deadlineTs = Date.parse(deadline);
    if (!Number.isFinite(deadlineTs)) return 'No deadline';

    const diff = deadlineTs - Date.now();
    if (diff <= 0) return 'Ended';

    const totalMinutes = Math.floor(diff / (1000 * 60));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
};

export const ProposalCard = ({
    roomId,
    proposal,
    currentUserId,
    onOpen,
}: {
    roomId: string;
    proposal: ProposalModel;
    currentUserId: string;
    onOpen: (proposalId: string) => void;
}) => {
    const votes = useVotes(proposal.proposalEventId, roomId);

    const voteCount = votes.data.length;
    const progress = Math.min(100, proposal.quorum > 0 ? (voteCount / proposal.quorum) * 100 : 0);

    const myVote = useMemo(
        () => votes.data.find((vote) => vote.voterId === currentUserId) ?? null,
        [currentUserId, votes.data],
    );

    const voteLabel = (vote: VoteModel | null): string => {
        if (!vote) return 'Not voted';
        if (typeof vote.choice === 'string') return `Voted: ${vote.choice}`;
        return `Voted: ${vote.choice.join(', ')}`;
    };

    return (
        <article
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                background: 'var(--bg-surface)',
                padding: 12,
                display: 'grid',
                gap: 8,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    alignItems: 'center',
                }}
            >
                <div>
                    <strong>{proposal.title}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        by {proposal.authorId}
                    </div>
                </div>
                <span
                    style={{
                        background: statusColor[proposal.status],
                        color: '#fff',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 12,
                    }}
                >
                    {proposal.status}
                </span>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
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
                            width: `${progress}%`,
                            height: '100%',
                            background: 'var(--accent-primary)',
                        }}
                    />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {voteCount}/{proposal.quorum} votes
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                }}
            >
                <span>{timeRemainingLabel(proposal.deadline)}</span>
                <span>{voteLabel(myVote)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    type="button"
                    onClick={() => onOpen(proposal.proposalEventId)}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        padding: '4px 10px',
                    }}
                >
                    {myVote ? 'View / Change Vote' : 'Vote'}
                </button>
            </div>
        </article>
    );
};

export default ProposalCard;
