export type ReputationTier = 'member' | 'vendor' | 'coordinator' | 'arbiter';

export interface MessagePayload {
  channelId: string;
  userId: string;
  content: string;
  stegoTier: 1 | 2 | 3;
  signature?: string;
}

export interface VoteResult {
  choice: string;
  votes: number;
  percentage: number;
}
