import type { GovernanceProposalCreated, GovernanceVoteCast } from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export const createGovernanceActions = (client: ApiClient) => ({
    createProposal: (payload: GovernanceProposalCreated['payload']) =>
        client<GovernanceProposalCreated>({
            method: 'POST',
            path: '/v1/governance/proposals',
            body: payload,
        }),
    castVote: (payload: GovernanceVoteCast['payload']) =>
        client<GovernanceVoteCast>({
            method: 'POST',
            path: '/v1/governance/votes',
            body: payload,
        }),
});
