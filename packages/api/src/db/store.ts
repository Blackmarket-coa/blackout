import type {
  ChannelRecord,
  FederationLinkRecord,
  MessageRecord,
  UserRecord,
  VoteEntryRecord,
  VoteRecord,
} from './types';

const nowIso = () => new Date().toISOString();

class InMemoryDb {
  users = new Map<string, UserRecord>();
  channels = new Map<string, ChannelRecord>();
  messages = new Map<string, MessageRecord>();
  votes = new Map<string, VoteRecord>();
  voteEntries = new Map<string, VoteEntryRecord>();
  federationLinks = new Map<string, FederationLinkRecord>();

  createUser(input: Omit<UserRecord, 'createdAt'>): UserRecord {
    const record: UserRecord = { ...input, createdAt: nowIso() };
    this.users.set(record.id, record);
    return record;
  }

  findUserByEmail(email: string): UserRecord | undefined {
    return [...this.users.values()].find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  findUserByUsername(username: string): UserRecord | undefined {
    return [...this.users.values()].find((user) => user.username.toLowerCase() === username.toLowerCase());
  }

  getUserById(id: string): UserRecord | undefined {
    return this.users.get(id);
  }

  createChannel(input: Omit<ChannelRecord, 'createdAt'>): ChannelRecord {
    const record: ChannelRecord = { ...input, createdAt: nowIso() };
    this.channels.set(record.id, record);
    return record;
  }

  listChannels(): ChannelRecord[] {
    return [...this.channels.values()];
  }

  createMessage(input: Omit<MessageRecord, 'createdAt'>): MessageRecord {
    const record: MessageRecord = { ...input, createdAt: nowIso() };
    this.messages.set(record.id, record);
    return record;
  }

  getMessages(channelId: string, limit = 50, before?: string): MessageRecord[] {
    const sorted = [...this.messages.values()]
      .filter((msg) => msg.channelId === channelId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

    const filtered = before ? sorted.filter((msg) => msg.createdAt < before) : sorted;
    return filtered.slice(-limit);
  }

  createVote(input: Omit<VoteRecord, 'createdAt' | 'startsAt' | 'endsAt'>): VoteRecord {
    const startsAt = nowIso();
    const endsAt = new Date(Date.now() + input.durationHours * 3600 * 1000).toISOString();
    const vote: VoteRecord = {
      ...input,
      startsAt,
      endsAt,
      createdAt: startsAt,
    };
    this.votes.set(vote.id, vote);
    return vote;
  }

  getVote(voteId: string): VoteRecord | undefined {
    return this.votes.get(voteId);
  }

  castVote(input: Omit<VoteEntryRecord, 'createdAt'>): VoteEntryRecord {
    const exists = [...this.voteEntries.values()].find((entry) => entry.voteId === input.voteId && entry.userId === input.userId);
    if (exists) {
      throw new Error('You have already voted');
    }

    const entry: VoteEntryRecord = { ...input, createdAt: nowIso() };
    this.voteEntries.set(entry.id, entry);
    return entry;
  }

  getVoteEntries(voteId: string): VoteEntryRecord[] {
    return [...this.voteEntries.values()].filter((entry) => entry.voteId === voteId);
  }

  createFederationLink(input: Omit<FederationLinkRecord, 'createdAt'>): FederationLinkRecord {
    const record: FederationLinkRecord = { ...input, createdAt: nowIso() };
    this.federationLinks.set(record.id, record);
    return record;
  }

  getFederatedCommunities(communityIds: string[]): string[] {
    const linked = [...this.federationLinks.values()].flatMap((link) => [link.sourceCommunityId, link.targetCommunityId]);
    return [...new Set(linked.filter((id) => communityIds.includes(id)))];
  }
}

export const db = new InMemoryDb();
