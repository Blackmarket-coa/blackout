import { api } from '../lib/api';

export function useGovernance() {
  return {
    createVote(payload: {
      communityId: string;
      proposerId: string;
      title: string;
      description?: string;
      options?: string[];
      durationHours?: number;
    }) {
      return api.createVote(payload);
    },

    castVote(voteId: string, choice: string, userId = 'demo-user') {
      return api.castVote(voteId, { userId, choice });
    },

    getVote(voteId: string) {
      return api.getVote(voteId);
    },
  };
}
