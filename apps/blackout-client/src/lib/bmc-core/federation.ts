export interface FederationLink {
  id: string;
  sourceCommunityId: string;
  targetCommunityId: string;
  linkType: 'zone' | 'alliance' | 'supply_chain';
  matrixBridgeRoomId: string;
  isActive: boolean;
}

export function formatFederatedMessage(userId: string, content: string): string {
  return `[Blackout] ${userId}: ${content}`;
}
