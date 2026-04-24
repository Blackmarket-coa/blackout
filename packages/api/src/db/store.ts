import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hashPassword } from '../services/auth';
import type {
  CanopyVoiceRoomRecord,
  ChannelRecord,
  FederationLinkRecord,
  MessageRecord,
  ModerationActionRecord,
  DeadDropRecord,
  ForumPostRecord,
  UserRecord,
  VoiceRoomEventRecord,
  VoiceRoomParticipantRecord,
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
  forumPosts: ForumPostRecord[];
  deadDrops: DeadDropRecord[];
  moderationActions: ModerationActionRecord[];
  canopyVoiceRooms: CanopyVoiceRoomRecord[];
  voiceRoomParticipants: VoiceRoomParticipantRecord[];
  voiceRoomEvents: VoiceRoomEventRecord[];
};

class InMemoryDb {
  users = new Map<string, UserRecord>();
  channels = new Map<string, ChannelRecord>();
  messages = new Map<string, MessageRecord>();
  votes = new Map<string, VoteRecord>();
  voteEntries = new Map<string, VoteEntryRecord>();
  federationLinks = new Map<string, FederationLinkRecord>();
  forumPosts = new Map<string, ForumPostRecord>();
  deadDrops = new Map<string, DeadDropRecord>();
  moderationActions = new Map<string, ModerationActionRecord>();
  canopyVoiceRooms = new Map<string, CanopyVoiceRoomRecord>();
  voiceRoomParticipants = new Map<string, VoiceRoomParticipantRecord>();
  voiceRoomEvents = new Map<string, VoiceRoomEventRecord>();

  constructor() {
    const explicitDemoPassword = process.env.BLACKOUT_DEMO_PASSWORD;
    if (process.env.NODE_ENV === 'production' && !explicitDemoPassword) {
      // Refuse to seed a known-password demo account in production. Operators
      // who actually want a demo user in prod must set BLACKOUT_DEMO_PASSWORD
      // to an explicit, non-default value.
      return;
    }
    const demoPassword = explicitDemoPassword ?? 'demo';
    this.createUser({
      id: 'demo-user',
      username: 'demo',
      email: 'demo@blackout.local',
      passwordHash: hashPassword(demoPassword),
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

  deleteUser(id: string): boolean {
    return this.users.delete(id);
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

  createForumPost(input: Omit<ForumPostRecord, 'createdAt'>): ForumPostRecord {
    const record: ForumPostRecord = { ...input, createdAt: nowIso() };
    this.forumPosts.set(record.id, record);
    return record;
  }

  listForumPosts(communityId: string): ForumPostRecord[] {
    return [...this.forumPosts.values()].filter((post) => post.communityId === communityId);
  }

  createDeadDrop(input: Omit<DeadDropRecord, 'createdAt' | 'openedAt'>): DeadDropRecord {
    const record: DeadDropRecord = { ...input, createdAt: nowIso() };
    this.deadDrops.set(record.id, record);
    return record;
  }

  openDeadDrop(id: string, recipientId: string): DeadDropRecord | undefined {
    const existing = this.deadDrops.get(id);
    if (!existing || existing.recipientId !== recipientId) {
      return undefined;
    }

    if (!existing.openedAt) {
      this.deadDrops.set(id, { ...existing, openedAt: nowIso() });
    }

    return this.deadDrops.get(id);
  }

  createModerationAction(input: Omit<ModerationActionRecord, 'createdAt'>): ModerationActionRecord {
    const record: ModerationActionRecord = { ...input, createdAt: nowIso() };
    this.moderationActions.set(record.id, record);
    return record;
  }

  listModerationActions(communityId: string): ModerationActionRecord[] {
    return [...this.moderationActions.values()].filter((action) => action.communityId === communityId);
  }

  getFederatedCommunities(communityIds: string[]): string[] {
    const linked = [...this.federationLinks.values()].flatMap((link) => [link.sourceCommunityId, link.targetCommunityId]);
    return [...new Set(linked.filter((id) => communityIds.includes(id)))];
  }

  getVoiceRoom(canopyId: string, channelId: string): CanopyVoiceRoomRecord | undefined {
    return [...this.canopyVoiceRooms.values()].find((room) => room.canopyId === canopyId && room.channelId === channelId && room.active);
  }

  createOrUpdateVoiceRoom(input: {
    canopyId: string;
    channelId: string;
    createdBy: string;
    livekitRoomName: string;
    isLocked?: boolean;
  }): CanopyVoiceRoomRecord {
    const existing = this.getVoiceRoom(input.canopyId, input.channelId);
    const timestamp = nowIso();
    if (existing) {
      const updated: CanopyVoiceRoomRecord = {
        ...existing,
        active: true,
        livekitRoomName: input.livekitRoomName,
        isLocked: input.isLocked ?? existing.isLocked,
        updatedAt: timestamp,
      };
      this.canopyVoiceRooms.set(updated.id, updated);
      return updated;
    }

    const created: CanopyVoiceRoomRecord = {
      id: crypto.randomUUID(),
      canopyId: input.canopyId,
      channelId: input.channelId,
      livekitRoomName: input.livekitRoomName,
      createdBy: input.createdBy,
      isLocked: Boolean(input.isLocked),
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.canopyVoiceRooms.set(created.id, created);
    return created;
  }

  setVoiceRoomLock(roomId: string, isLocked: boolean): CanopyVoiceRoomRecord | undefined {
    const existing = this.canopyVoiceRooms.get(roomId);
    if (!existing) return undefined;
    const updated: CanopyVoiceRoomRecord = { ...existing, isLocked, updatedAt: nowIso() };
    this.canopyVoiceRooms.set(roomId, updated);
    return updated;
  }

  joinVoiceRoom(input: Omit<VoiceRoomParticipantRecord, 'id' | 'joinedAt' | 'leftAt'>): VoiceRoomParticipantRecord {
    const existingActive = [...this.voiceRoomParticipants.values()].find(
      (participant) => participant.roomId === input.roomId && participant.userId === input.userId && !participant.leftAt
    );
    if (existingActive) {
      return existingActive;
    }
    const participant: VoiceRoomParticipantRecord = {
      id: crypto.randomUUID(),
      roomId: input.roomId,
      userId: input.userId,
      role: input.role,
      canPublish: input.canPublish,
      canSubscribe: input.canSubscribe,
      joinedAt: nowIso(),
    };
    this.voiceRoomParticipants.set(participant.id, participant);
    return participant;
  }

  leaveVoiceRoom(roomId: string, userId: string): VoiceRoomParticipantRecord | undefined {
    const existing = [...this.voiceRoomParticipants.values()].find((participant) => participant.roomId === roomId && participant.userId === userId && !participant.leftAt);
    if (!existing) return undefined;
    const updated = { ...existing, leftAt: nowIso() };
    this.voiceRoomParticipants.set(updated.id, updated);
    return updated;
  }

  getVoiceRoomActiveParticipants(roomId: string): VoiceRoomParticipantRecord[] {
    return [...this.voiceRoomParticipants.values()].filter((participant) => participant.roomId === roomId && !participant.leftAt);
  }

  logVoiceRoomEvent(input: Omit<VoiceRoomEventRecord, 'id' | 'createdAt'>): VoiceRoomEventRecord {
    const record: VoiceRoomEventRecord = { ...input, id: crypto.randomUUID(), createdAt: nowIso() };
    this.voiceRoomEvents.set(record.id, record);
    return record;
  }

  listVoiceRoomEvents(roomId: string): VoiceRoomEventRecord[] {
    return [...this.voiceRoomEvents.values()]
      .filter((event) => event.roomId === roomId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
    this.forumPosts = new Map((parsed.forumPosts ?? []).map((row) => [row.id, row]));
    this.deadDrops = new Map((parsed.deadDrops ?? []).map((row) => [row.id, row]));
    this.moderationActions = new Map((parsed.moderationActions ?? []).map((row) => [row.id, row]));
    this.canopyVoiceRooms = new Map((parsed.canopyVoiceRooms ?? []).map((row) => [row.id, row]));
    this.voiceRoomParticipants = new Map((parsed.voiceRoomParticipants ?? []).map((row) => [row.id, row]));
    this.voiceRoomEvents = new Map((parsed.voiceRoomEvents ?? []).map((row) => [row.id, row]));
  }

  private snapshot(): PersistedState {
    return {
      users: [...this.users.values()],
      channels: [...this.channels.values()],
      messages: [...this.messages.values()],
      votes: [...this.votes.values()],
      voteEntries: [...this.voteEntries.values()],
      federationLinks: [...this.federationLinks.values()],
      forumPosts: [...this.forumPosts.values()],
      deadDrops: [...this.deadDrops.values()],
      moderationActions: [...this.moderationActions.values()],
      canopyVoiceRooms: [...this.canopyVoiceRooms.values()],
      voiceRoomParticipants: [...this.voiceRoomParticipants.values()],
      voiceRoomEvents: [...this.voiceRoomEvents.values()],
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

  override deleteUser(id: string): boolean {
    const removed = super.deleteUser(id);
    if (removed) this.persist();
    return removed;
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

  override createForumPost(input: Omit<ForumPostRecord, 'createdAt'>): ForumPostRecord {
    const created = super.createForumPost(input);
    this.persist();
    return created;
  }

  override createDeadDrop(input: Omit<DeadDropRecord, 'createdAt' | 'openedAt'>): DeadDropRecord {
    const created = super.createDeadDrop(input);
    this.persist();
    return created;
  }

  override openDeadDrop(id: string, recipientId: string): DeadDropRecord | undefined {
    const opened = super.openDeadDrop(id, recipientId);
    if (opened) {
      this.persist();
    }

    return opened;
  }

  override createModerationAction(input: Omit<ModerationActionRecord, 'createdAt'>): ModerationActionRecord {
    const created = super.createModerationAction(input);
    this.persist();
    return created;
  }

  override createOrUpdateVoiceRoom(input: {
    canopyId: string;
    channelId: string;
    createdBy: string;
    livekitRoomName: string;
    isLocked?: boolean;
  }): CanopyVoiceRoomRecord {
    const room = super.createOrUpdateVoiceRoom(input);
    this.persist();
    return room;
  }

  override setVoiceRoomLock(roomId: string, isLocked: boolean): CanopyVoiceRoomRecord | undefined {
    const room = super.setVoiceRoomLock(roomId, isLocked);
    if (room) this.persist();
    return room;
  }

  override joinVoiceRoom(input: Omit<VoiceRoomParticipantRecord, 'id' | 'joinedAt' | 'leftAt'>): VoiceRoomParticipantRecord {
    const participant = super.joinVoiceRoom(input);
    this.persist();
    return participant;
  }

  override leaveVoiceRoom(roomId: string, userId: string): VoiceRoomParticipantRecord | undefined {
    const participant = super.leaveVoiceRoom(roomId, userId);
    if (participant) this.persist();
    return participant;
  }

  override logVoiceRoomEvent(input: Omit<VoiceRoomEventRecord, 'id' | 'createdAt'>): VoiceRoomEventRecord {
    const event = super.logVoiceRoomEvent(input);
    this.persist();
    return event;
  }
}

export const db = DB_MODE === 'memory' ? new InMemoryDb() : new FileBackedDb();
