export function useFederation() {
  return {
    async fetchCommunities() {
      return [] as Array<{ id: string; name: string }>;
    },
  };
}
