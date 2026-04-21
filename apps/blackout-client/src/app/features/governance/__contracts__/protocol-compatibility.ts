import type {
    GovernanceProposalPayload,
    GovernanceVotePayload,
    GOVERNANCE_EVENT_NAMES,
} from '@blackout/protocol';

const proposalPayload: GovernanceProposalPayload = {
    title: 'Upgrade relay nodes',
    description: 'Roll out relay patch set',
    type: 'binary',
    options: [
        { id: 'approve', label: 'Approve' },
        { id: 'block', label: 'Block' },
    ],
    quorum: 10,
    deadline: new Date().toISOString(),
    eligibility: 'all',
    status: 'active',
};

const votePayload: GovernanceVotePayload = {
    proposalEventId: 'evt_123',
    choice: 'approve',
};

void proposalPayload;
void votePayload;
void ({} as typeof GOVERNANCE_EVENT_NAMES);
