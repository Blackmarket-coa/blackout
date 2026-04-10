import type { EventEnvelope } from '../common/types';

export const GOVERNANCE_PROTOCOL_VERSION = 1 as const;

export const GOVERNANCE_EVENT_NAMES = {
    proposal: 'co.bmc.proposal',
    vote: 'co.bmc.vote',
} as const;

export type GovernanceEventName =
    (typeof GOVERNANCE_EVENT_NAMES)[keyof typeof GOVERNANCE_EVENT_NAMES];

export interface GovernanceProposalOption {
    id: string;
    label: string;
}

export type GovernanceProposalType = 'binary' | 'multiple_choice' | 'ranked';
export type GovernanceProposalStatus = 'active' | 'passed' | 'failed' | 'cancelled';

export interface GovernanceProposalPayload {
    title: string;
    description: string;
    type: GovernanceProposalType;
    options: GovernanceProposalOption[];
    quorum: number;
    deadline: string;
    eligibility: 'all' | `role:${string}` | `power:${string}`;
    status: GovernanceProposalStatus;
}

export interface GovernanceVotePayload {
    proposalEventId: string;
    choice: string | string[];
}

export type GovernanceProposalEvent = EventEnvelope<'blackout.governance.proposal.created', GovernanceProposalPayload>;
export type GovernanceVoteEvent = EventEnvelope<'blackout.governance.vote.cast', GovernanceVotePayload>;

export interface GovernanceProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof GOVERNANCE_PROTOCOL_VERSION;
    eventNames: typeof GOVERNANCE_EVENT_NAMES;
    policy: 'additive-only-minor';
}

export const GOVERNANCE_PROTOCOL_SURFACE: GovernanceProtocolSurface = {
    owner: '@blackout/protocol',
    version: GOVERNANCE_PROTOCOL_VERSION,
    eventNames: GOVERNANCE_EVENT_NAMES,
    policy: 'additive-only-minor',
};
