import { api } from '../lib/api';

export function useFederation() {
  return {
    async fetchCommunities(communityIds: string[]) {
      const data = await api.getFederatedCommunities(communityIds);
      return data.communities;
    },
  };
}
