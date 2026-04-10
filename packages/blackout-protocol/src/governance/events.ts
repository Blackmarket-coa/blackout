import type { EventEnvelope } from '../common/types';

export type GovernanceProposalCreated = EventEnvelope<
    'blackout.governance.proposal.created',
    {
        proposalId: string;
        title: string;
        summary: string;
        options: string[];
        closesAt: string;
    }
>;

export type GovernanceVoteCast = EventEnvelope<
    'blackout.governance.vote.cast',
    {
        proposalId: string;
        vote: string;
    }
>;

export const isGovernanceProposalCreated = (
    value: unknown
): value is GovernanceProposalCreated => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<GovernanceProposalCreated>;
    return (
        candidate.event === 'blackout.governance.proposal.created' &&
        typeof candidate.roomId === 'string' &&
        typeof candidate.senderId === 'string' &&
        typeof candidate.occurredAt === 'string' &&
        typeof candidate.payload?.proposalId === 'string'
    );
};
