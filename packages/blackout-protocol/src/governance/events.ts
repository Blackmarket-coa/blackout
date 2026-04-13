import type { EventEnvelope } from '../common/types';
import type { GovernanceProposalPayload, GovernanceVotePayload } from './contracts';

export const GOVERNANCE_PROPOSAL_EVENT_TYPE = 'co.bmc.proposal';
export const GOVERNANCE_VOTE_EVENT_TYPE = 'co.bmc.vote';
export const GOVERNANCE_SCHEMA_VERSION = 1;

export type GovernanceProposalCreated = EventEnvelope<
    'blackout.governance.proposal.created',
    GovernanceProposalPayload
>;

export type GovernanceVoteCast = EventEnvelope<'blackout.governance.vote.cast', GovernanceVotePayload>;

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
        typeof candidate.payload?.title === 'string'
    );
};
