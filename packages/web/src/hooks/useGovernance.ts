import { api } from '../lib/api';

export function useGovernance() {
  return {
    castVote(voteId: string, choice: string, userId = 'demo-user') {
      return api.castVote(voteId, { userId, choice });
    },

    getVote(voteId: string) {
      return api.getVote(voteId);
    },
  };
}
