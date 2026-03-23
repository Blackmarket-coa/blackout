export function useGovernance() {
  return {
    async castVote(voteId: string, choice: string) {
      return { voteId, choice, success: true };
    },
  };
}
