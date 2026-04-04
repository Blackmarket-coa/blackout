export type UUID = string;

export interface UserRecord {
  id: UUID;
  username: string;
  email: string;
  passwordHash: string;
  reputationScore: number;
  reputationTier: 'member' | 'vendor' | 'coordinator' | 'arbiter';
  pubkeyEd25519: string;
  createdAt: string;
}

export interface CommunityRecord {
  id: UUID;
  name: string;
  matrixRoomId?: string;
  description?: string;
  federationTier: 'local' | 'zone' | 'global';
  isBroadcast: boolean;
  createdAt: string;
}

export interface ChannelRecord {
  id: UUID;
  communityId: UUID;
  name: string;
  description?: string;
  channelType: 'text' | 'voice' | 'broadcast' | 'governance';
  isPrivate: boolean;
  matrixRoomId?: string;
  createdAt: string;
}

export interface MessageRecord {
  id: UUID;
  channelId: UUID;
  userId: UUID;
  content: string;
  governance?: { type: 'poll'; data: VoteRecord };
  contentStegoTier: 1 | 2 | 3;
  signature?: string;
  isEncrypted: boolean;
  encryptionAlgorithm?: string;
  createdAt: string;
}

export interface VoteRecord {
  id: UUID;
  communityId: UUID;
  proposerId: UUID;
  title: string;
  description?: string;
  voteType: 'yes_no' | 'ranked_choice' | 'weighted';
  options: Array<{ id: string; text: string }>;
  requiresQuorum: number;
  durationHours: number;
  status: 'active' | 'closed' | 'passed' | 'failed';
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

export interface VoteEntryRecord {
  id: UUID;
  voteId: UUID;
  userId: UUID;
  choice: string;
  weight: number;
  createdAt: string;
}

export interface FederationLinkRecord {
  id: UUID;
  sourceCommunityId: UUID;
  targetCommunityId: UUID;
  linkType: 'zone' | 'alliance' | 'supply_chain';
  matrixBridgeRoomId: string;
  isActive: boolean;
  createdAt: string;
}
