import { api } from '../lib/api';

export function useGovernance() {
  return {
    createProposal(payload: {
      communityId: string;
      proposerId: string;
      title: string;
      description?: string;
      options?: Array<{ id?: string; label?: string }>;
      durationHours?: number;
    }) {
      return api.createProposal(payload);
    },

    castVote(voteId: string, choice: string, userId = 'demo-user') {
      return api.castVote({ voteId, userId, choice });
    },

    getProposal(proposalId: string) {
      return api.getProposal(proposalId);
    },
  };
}
