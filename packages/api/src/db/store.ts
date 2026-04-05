import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  ChannelRecord,
  FederationLinkRecord,
  MessageRecord,
  UserRecord,
  VoteEntryRecord,
  VoteRecord,
} from './types';

const nowIso = () => new Date().toISOString();
const DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'file';
const DB_FILE_PATH = resolve(process.cwd(), process.env.BLACKOUT_DB_FILE ?? '.blackout/data/store.json');

type PersistedState = {
  users: UserRecord[];
  channels: ChannelRecord[];
  messages: MessageRecord[];
  votes: VoteRecord[];
  voteEntries: VoteEntryRecord[];
  federationLinks: FederationLinkRecord[];
};

class InMemoryDb {
  users = new Map<string, UserRecord>();
  channels = new Map<string, ChannelRecord>();
  messages = new Map<string, MessageRecord>();
  votes = new Map<string, VoteRecord>();
  voteEntries = new Map<string, VoteEntryRecord>();
  federationLinks = new Map<string, FederationLinkRecord>();

  constructor() {
    this.createUser({
      id: 'demo-user',
      username: 'demo',
      email: 'demo@blackout.local',
      passwordHash: 'demo-password-hash',
      reputationScore: 100,
      reputationTier: 'member',
      pubkeyEd25519: 'demo-pubkey',
    });
  }

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

class FileBackedDb extends InMemoryDb {
  constructor() {
    super();
    this.hydrate();
  }

  private hydrate() {
    if (!existsSync(DB_FILE_PATH)) {
      this.persist();
      return;
    }

    const parsed = JSON.parse(readFileSync(DB_FILE_PATH, 'utf8')) as PersistedState;
    this.users = new Map(parsed.users.map((row) => [row.id, row]));
    this.channels = new Map(parsed.channels.map((row) => [row.id, row]));
    this.messages = new Map(parsed.messages.map((row) => [row.id, row]));
    this.votes = new Map(parsed.votes.map((row) => [row.id, row]));
    this.voteEntries = new Map(parsed.voteEntries.map((row) => [row.id, row]));
    this.federationLinks = new Map(parsed.federationLinks.map((row) => [row.id, row]));
  }

  private snapshot(): PersistedState {
    return {
      users: [...this.users.values()],
      channels: [...this.channels.values()],
      messages: [...this.messages.values()],
      votes: [...this.votes.values()],
      voteEntries: [...this.voteEntries.values()],
      federationLinks: [...this.federationLinks.values()],
    };
  }

  private persist() {
    mkdirSync(dirname(DB_FILE_PATH), { recursive: true });
    writeFileSync(DB_FILE_PATH, `${JSON.stringify(this.snapshot(), null, 2)}\n`, 'utf8');
  }

  override createUser(input: Omit<UserRecord, 'createdAt'>): UserRecord {
    const created = super.createUser(input);
    this.persist();
    return created;
  }

  override createChannel(input: Omit<ChannelRecord, 'createdAt'>): ChannelRecord {
    const created = super.createChannel(input);
    this.persist();
    return created;
  }

  override createMessage(input: Omit<MessageRecord, 'createdAt'>): MessageRecord {
    const created = super.createMessage(input);
    this.persist();
    return created;
  }

  override createVote(input: Omit<VoteRecord, 'createdAt' | 'startsAt' | 'endsAt'>): VoteRecord {
    const created = super.createVote(input);
    this.persist();
    return created;
  }

  override castVote(input: Omit<VoteEntryRecord, 'createdAt'>): VoteEntryRecord {
    const created = super.castVote(input);
    this.persist();
    return created;
  }

  override createFederationLink(input: Omit<FederationLinkRecord, 'createdAt'>): FederationLinkRecord {
    const created = super.createFederationLink(input);
    this.persist();
    return created;
  }
}

export const db = DB_MODE === 'memory' ? new InMemoryDb() : new FileBackedDb();
