import {
    GOVERNANCE_PROPOSAL_EVENT_TYPE,
    GOVERNANCE_SCHEMA_VERSION,
    GOVERNANCE_VOTE_EVENT_TYPE,
    type GovernanceProposalPayload,
    type GovernanceVotePayload,
} from '@blackout/protocol';
import type { MatrixEventClient } from '../matrix/types';

export const createGovernanceMatrixActions = (client: MatrixEventClient) => ({
    createProposal: async (roomId: string, content: GovernanceProposalPayload, stateKey: string) =>
        client.sendStateEvent(
            roomId,
            GOVERNANCE_PROPOSAL_EVENT_TYPE,
            { ...content, schemaVersion: GOVERNANCE_SCHEMA_VERSION },
            stateKey
        ),
    castVote: async (roomId: string, payload: GovernanceVotePayload) =>
        client.sendEvent(roomId, GOVERNANCE_VOTE_EVENT_TYPE, {
            ...payload,
            schemaVersion: GOVERNANCE_SCHEMA_VERSION,
            voteId: crypto.randomUUID(),
            submittedAt: Date.now(),
        }),
});

