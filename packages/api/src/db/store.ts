import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hashPassword } from '../services/auth';
import type {
  CanopyDirectoryEntryRecord,
  CanopyVoiceRoomRecord,
  FederationLinkRecord,
  MarketplaceEntitlementRecord,
  MarketplaceLicenseKeyRecord,
  MarketplaceListingsCacheRecord,
  MarketplaceProviderIdString,
  MarketplaceWebhookAuditRecord,
  MessageRecord,
  ScheduledMessageRecord,
  ModerationActionRecord,
  DeadDropRecord,
  DeadmanSwitchRecord,
  DeadmanSwitchStatus,
  ForumPostRecord,
  UserRecord,
  VoiceRoomEventRecord,
  VoiceRoomParticipantRecord,
  VoteEntryRecord,
  VoteRecord,
  ForumPostRecord,
  DeadDropRecord,
  ModerationActionRecord,
  CreatorStreamAuthRecord,
  StreamRecord,
  StreamSessionRecord,
  StreamModerationRecord,
  ClipRecord,
  TipRecord,
  CreatorSubscriptionTierRecord,
  CreatorSubscriptionRecord,
  CommunityBoostPledgeRecord,
  AidPoolRecord,
  AdRevenuePeriodRecord,
  AdRevenueShareRecord,
  PasswordResetTokenRecord,
  EmailVerificationTokenRecord,
  AccountDeletionTokenRecord,
  InvitationTokenRecord,
  InvitationRedemptionRecord,
  RefreshTokenRecord,
  RevokedSessionRecord,
  LinkedAccountRecord,
  LinkedAccountProvider,
  PendingOAuthLinkRecord,
  TwitchChatBridgeRecord,
  TwitchEventSubscriptionRecord,
  WidgetAlertTokenRecord,
  YoutubeChatBridgeRecord,
  KickChatBridgeRecord,
  DiscordCompatWebhookRecord,
  OutboundEventWebhookRecord,
  TwitchIrcBotTokenRecord,
  ObsWsPasswordRecord,
  SimulcastDestinationRecord,
  CoalitionSpatialItemRecord,
  CoalitionAidPostRecord,
  PluginInstallationRecord,
  ColiseumTopicRecord,
  ColiseumArgumentRecord,
  ColiseumVoteRecord,
  ColiseumLiveSessionRecord,
} from './types';
import { COALITION_SPATIAL_SEED, COALITION_AID_SEED } from './coalitionSeed';
import { hydrateMap, introspectColumns, type TablePlan } from './pgWriter';
import { MUTATOR_SPECS, TABLE_DESCRIPTORS } from './pgDescriptors';
import { WriteBehindQueue } from './writeBehindQueue';
import type { PgPool } from './migrate';
import { log } from '../telemetry/logger';

const nowIso = () => new Date().toISOString();
const DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'file';
const DB_FILE_PATH = resolve(process.cwd(), process.env.BLACKOUT_DB_FILE ?? '.blackout/data/store.json');

type PersistedState = {
  users: UserRecord[];
  canopyDirectoryEntries: CanopyDirectoryEntryRecord[];
  messages: MessageRecord[];
  scheduledMessages: ScheduledMessageRecord[];
  votes: VoteRecord[];
  voteEntries: VoteEntryRecord[];
  federationLinks: FederationLinkRecord[];
  forumPosts: ForumPostRecord[];
  deadDrops: DeadDropRecord[];
  deadmanSwitches: DeadmanSwitchRecord[];
  moderationActions: ModerationActionRecord[];
  creatorStreamAuth: CreatorStreamAuthRecord[];
  streams: StreamRecord[];
  streamSessions: StreamSessionRecord[];
  streamModeration: StreamModerationRecord[];
  clips: ClipRecord[];
  canopyVoiceRooms: CanopyVoiceRoomRecord[];
  voiceRoomParticipants: VoiceRoomParticipantRecord[];
  voiceRoomEvents: VoiceRoomEventRecord[];
  marketplaceEntitlements: MarketplaceEntitlementRecord[];
  marketplaceWebhookAudit: MarketplaceWebhookAuditRecord[];
  marketplaceLicenseKeys: MarketplaceLicenseKeyRecord[];
  marketplaceListingsCache: MarketplaceListingsCacheRecord[];
  tips: TipRecord[];
  creatorSubscriptionTiers: CreatorSubscriptionTierRecord[];
  creatorSubscriptions: CreatorSubscriptionRecord[];
  communityBoostPledges: CommunityBoostPledgeRecord[];
  aidPools: AidPoolRecord[];
  adRevenuePeriods: AdRevenuePeriodRecord[];
  adRevenueShares: AdRevenueShareRecord[];
  passwordResetTokens: PasswordResetTokenRecord[];
  emailVerificationTokens: EmailVerificationTokenRecord[];
  accountDeletionTokens: AccountDeletionTokenRecord[];
  invitationTokens: InvitationTokenRecord[];
  invitationRedemptions: InvitationRedemptionRecord[];
  refreshTokens: RefreshTokenRecord[];
  revokedSessions: RevokedSessionRecord[];
  linkedAccounts: LinkedAccountRecord[];
  pendingOAuthLinks: PendingOAuthLinkRecord[];
  twitchChatBridges: TwitchChatBridgeRecord[];
  twitchEventSubscriptions: TwitchEventSubscriptionRecord[];
  widgetAlertTokens: WidgetAlertTokenRecord[];
  youtubeChatBridges: YoutubeChatBridgeRecord[];
  kickChatBridges: KickChatBridgeRecord[];
  simulcastDestinations: SimulcastDestinationRecord[];
  discordCompatWebhooks: DiscordCompatWebhookRecord[];
  outboundEventWebhooks: OutboundEventWebhookRecord[];
  twitchIrcBotTokens: TwitchIrcBotTokenRecord[];
  obsWsPasswords: ObsWsPasswordRecord[];
  coalitionSpatialItems: CoalitionSpatialItemRecord[];
  coalitionAidPosts: CoalitionAidPostRecord[];
  pluginInstallations: PluginInstallationRecord[];
  coliseumTopics: ColiseumTopicRecord[];
  coliseumArguments: ColiseumArgumentRecord[];
  coliseumVotes: ColiseumVoteRecord[];
  coliseumLiveSessions: ColiseumLiveSessionRecord[];
};

class InMemoryDb {
  users = new Map<string, UserRecord>();
  /** Keyed by canopy (Matrix space) id. */
  canopyDirectoryEntries = new Map<string, CanopyDirectoryEntryRecord>();
  messages = new Map<string, MessageRecord>();
  /** Keyed by scheduled-message id. */
  scheduledMessages = new Map<string, ScheduledMessageRecord>();
  votes = new Map<string, VoteRecord>();
  voteEntries = new Map<string, VoteEntryRecord>();
  federationLinks = new Map<string, FederationLinkRecord>();
  forumPosts = new Map<string, ForumPostRecord>();
  deadDrops = new Map<string, DeadDropRecord>();
  deadmanSwitches = new Map<string, DeadmanSwitchRecord>();
  moderationActions = new Map<string, ModerationActionRecord>();
  creatorStreamAuth = new Map<string, CreatorStreamAuthRecord>();
  streams = new Map<string, StreamRecord>();
  streamSessions = new Map<string, StreamSessionRecord>();
  streamModeration = new Map<string, StreamModerationRecord>();
  clips = new Map<string, ClipRecord>();
  canopyVoiceRooms = new Map<string, CanopyVoiceRoomRecord>();
  voiceRoomParticipants = new Map<string, VoiceRoomParticipantRecord>();
  voiceRoomEvents = new Map<string, VoiceRoomEventRecord>();
  marketplaceEntitlements = new Map<string, MarketplaceEntitlementRecord>();
  marketplaceWebhookAudit = new Map<string, MarketplaceWebhookAuditRecord>();
  marketplaceLicenseKeys = new Map<string, MarketplaceLicenseKeyRecord>();
  marketplaceListingsCache = new Map<string, MarketplaceListingsCacheRecord>();
  tips = new Map<string, TipRecord>();
  creatorSubscriptionTiers = new Map<string, CreatorSubscriptionTierRecord>();
  creatorSubscriptions = new Map<string, CreatorSubscriptionRecord>();
  communityBoostPledges = new Map<string, CommunityBoostPledgeRecord>();
  aidPools = new Map<string, AidPoolRecord>();
  adRevenuePeriods = new Map<string, AdRevenuePeriodRecord>();
  adRevenueShares = new Map<string, AdRevenueShareRecord>();
  passwordResetTokens = new Map<string, PasswordResetTokenRecord>();
  emailVerificationTokens = new Map<string, EmailVerificationTokenRecord>();
  accountDeletionTokens = new Map<string, AccountDeletionTokenRecord>();
  /** Keyed by token id (a UUID); the hash is a non-primary lookup index. */
  invitationTokens = new Map<string, InvitationTokenRecord>();
  /** Keyed by redemption id. */
  invitationRedemptions = new Map<string, InvitationRedemptionRecord>();
  refreshTokens = new Map<string, RefreshTokenRecord>();
  revokedSessions = new Map<string, RevokedSessionRecord>();
  /** Keyed by `${blackoutUserId}:${provider}` to enforce one link per (user, provider). */
  linkedAccounts = new Map<string, LinkedAccountRecord>();
  /** Keyed by stateHash. */
  pendingOAuthLinks = new Map<string, PendingOAuthLinkRecord>();
  /** Keyed by bridge id. */
  twitchChatBridges = new Map<string, TwitchChatBridgeRecord>();
  /** Keyed by helixSubscriptionId for O(1) inbound-notification lookup. */
  twitchEventSubscriptions = new Map<string, TwitchEventSubscriptionRecord>();
  /** Keyed by secretHash so the SSE handler can validate a presented bearer in O(1). */
  widgetAlertTokens = new Map<string, WidgetAlertTokenRecord>();
  /** Keyed by bridge id. */
  youtubeChatBridges = new Map<string, YoutubeChatBridgeRecord>();
  /** Keyed by bridge id. */
  kickChatBridges = new Map<string, KickChatBridgeRecord>();
  /** Keyed by destination id. */
  simulcastDestinations = new Map<string, SimulcastDestinationRecord>();
  /** Keyed by webhook id (the public part of the URL). */
  discordCompatWebhooks = new Map<string, DiscordCompatWebhookRecord>();
  /** Keyed by subscription id. */
  outboundEventWebhooks = new Map<string, OutboundEventWebhookRecord>();
  /** Keyed by token id. */
  twitchIrcBotTokens = new Map<string, TwitchIrcBotTokenRecord>();
  /** Keyed by password id (also the URL slug). */
  obsWsPasswords = new Map<string, ObsWsPasswordRecord>();
  /** Coalition spatial map pins, keyed by item id. */
  coalitionSpatialItems = new Map<string, CoalitionSpatialItemRecord>(
    COALITION_SPATIAL_SEED.map((row) => [row.id, row]),
  );
  /** Coalition mutual-aid posts, keyed by post id. */
  coalitionAidPosts = new Map<string, CoalitionAidPostRecord>(
    COALITION_AID_SEED.map((row) => [row.id, row]),
  );
  /** Plugin installations (activation-at-scope), keyed by installation id. */
  pluginInstallations = new Map<string, PluginInstallationRecord>();
  /** Coliseum debate topics, keyed by topic id. */
  coliseumTopics = new Map<string, ColiseumTopicRecord>();
  /** Coliseum arguments, keyed by argument id. */
  coliseumArguments = new Map<string, ColiseumArgumentRecord>();
  /** Coliseum votes, keyed by `${argumentId}::${voterId}` (one vote per pair). */
  coliseumVotes = new Map<string, ColiseumVoteRecord>();
  /** Coliseum live debate sessions, keyed by session id. */
  coliseumLiveSessions = new Map<string, ColiseumLiveSessionRecord>();

  constructor() {
    const explicitDemoPassword = process.env.BLACKOUT_DEMO_PASSWORD;
    if (process.env.NODE_ENV === 'production' && !explicitDemoPassword) {
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

  updateUserPassword(id: string, passwordHash: string): UserRecord | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated: UserRecord = { ...user, passwordHash };
    this.users.set(id, updated);
    return updated;
  }

  // --- password reset ---

  createPasswordResetToken(input: Omit<PasswordResetTokenRecord, 'createdAt'>): PasswordResetTokenRecord {
    const record: PasswordResetTokenRecord = { ...input, createdAt: nowIso() };
    this.passwordResetTokens.set(record.id, record);
    return record;
  }

  findPasswordResetTokenByHash(tokenHash: string): PasswordResetTokenRecord | undefined {
    return [...this.passwordResetTokens.values()].find((t) => t.tokenHash === tokenHash);
  }

  consumePasswordResetToken(id: string): PasswordResetTokenRecord | undefined {
    const existing = this.passwordResetTokens.get(id);
    if (!existing) return undefined;
    if (existing.consumedAt) return existing;
    const updated: PasswordResetTokenRecord = { ...existing, consumedAt: nowIso() };
    this.passwordResetTokens.set(id, updated);
    return updated;
  }

  deleteExpiredPasswordResetTokens(now: Date = new Date()): number {
    let removed = 0;
    for (const [id, record] of this.passwordResetTokens) {
      if (new Date(record.expiresAt).getTime() < now.getTime()) {
        this.passwordResetTokens.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  // --- email verification ---

  createEmailVerificationToken(
    input: Omit<EmailVerificationTokenRecord, 'createdAt'>,
  ): EmailVerificationTokenRecord {
    const record: EmailVerificationTokenRecord = { ...input, createdAt: nowIso() };
    this.emailVerificationTokens.set(record.id, record);
    return record;
  }

  findEmailVerificationTokenByHash(tokenHash: string): EmailVerificationTokenRecord | undefined {
    return [...this.emailVerificationTokens.values()].find((t) => t.tokenHash === tokenHash);
  }

  countActiveEmailVerificationTokensForUser(userId: string, since: Date): number {
    let count = 0;
    const cutoff = since.getTime();
    for (const record of this.emailVerificationTokens.values()) {
      if (record.userId === userId && new Date(record.createdAt).getTime() >= cutoff) {
        count += 1;
      }
    }
    return count;
  }

  listEmailVerificationTokensForUser(userId: string): EmailVerificationTokenRecord[] {
    return [...this.emailVerificationTokens.values()].filter((t) => t.userId === userId);
  }

  markEmailVerificationTokenSent(id: string): EmailVerificationTokenRecord | undefined {
    const existing = this.emailVerificationTokens.get(id);
    if (!existing) return undefined;
    if (existing.sentAt) return existing;
    const updated: EmailVerificationTokenRecord = { ...existing, sentAt: nowIso() };
    this.emailVerificationTokens.set(id, updated);
    return updated;
  }

  consumeEmailVerificationToken(id: string): EmailVerificationTokenRecord | undefined {
    const existing = this.emailVerificationTokens.get(id);
    if (!existing) return undefined;
    if (existing.consumedAt) return existing;
    const updated: EmailVerificationTokenRecord = { ...existing, consumedAt: nowIso() };
    this.emailVerificationTokens.set(id, updated);
    return updated;
  }

  revokeEmailVerificationTokensForUser(userId: string, reason: string): number {
    let revoked = 0;
    for (const [id, record] of this.emailVerificationTokens) {
      if (record.userId === userId && !record.consumedAt && !record.revokedReason) {
        this.emailVerificationTokens.set(id, { ...record, revokedReason: reason });
        revoked += 1;
      }
    }
    return revoked;
  }

  markUserEmailVerified(id: string, verifiedAt: string = nowIso()): UserRecord | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;
    if (user.emailVerifiedAt) return user;
    const updated: UserRecord = { ...user, emailVerifiedAt: verifiedAt };
    this.users.set(id, updated);
    return updated;
  }

  deleteExpiredEmailVerificationTokens(now: Date = new Date()): number {
    let removed = 0;
    for (const [id, record] of this.emailVerificationTokens) {
      if (new Date(record.expiresAt).getTime() < now.getTime() && !record.consumedAt) {
        this.emailVerificationTokens.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  // --- account deletion tokens ---

  createAccountDeletionToken(
    input: Omit<AccountDeletionTokenRecord, 'createdAt'>,
  ): AccountDeletionTokenRecord {
    const record: AccountDeletionTokenRecord = { ...input, createdAt: nowIso() };
    this.accountDeletionTokens.set(record.id, record);
    return record;
  }

  findAccountDeletionTokenByHash(tokenHash: string): AccountDeletionTokenRecord | undefined {
    return [...this.accountDeletionTokens.values()].find((t) => t.tokenHash === tokenHash);
  }

  consumeAccountDeletionToken(id: string): AccountDeletionTokenRecord | undefined {
    const existing = this.accountDeletionTokens.get(id);
    if (!existing) return undefined;
    if (existing.consumedAt) return existing;
    const updated: AccountDeletionTokenRecord = { ...existing, consumedAt: nowIso() };
    this.accountDeletionTokens.set(id, updated);
    return updated;
  }

  createInvitationToken(
    input: Omit<InvitationTokenRecord, 'createdAt' | 'useCount'> & { useCount?: number },
  ): InvitationTokenRecord {
    const record: InvitationTokenRecord = {
      ...input,
      useCount: input.useCount ?? 0,
      createdAt: nowIso(),
    };
    this.invitationTokens.set(record.id, record);
    return record;
  }

  getInvitationTokenById(id: string): InvitationTokenRecord | undefined {
    return this.invitationTokens.get(id);
  }

  findInvitationTokenByHash(tokenHash: string): InvitationTokenRecord | undefined {
    return [...this.invitationTokens.values()].find((t) => t.tokenHash === tokenHash);
  }

  listInvitationTokensByCreator(createdBy: string): InvitationTokenRecord[] {
    return [...this.invitationTokens.values()]
      .filter((t) => t.createdBy === createdBy)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Atomically bump useCount; returns the updated record or undefined when
   *  the token is gone / already exhausted / revoked / expired. Callers must
   *  re-check the conditions they care about against the returned record. */
  incrementInvitationTokenUseCount(id: string): InvitationTokenRecord | undefined {
    const existing = this.invitationTokens.get(id);
    if (!existing) return undefined;
    if (existing.revokedAt) return undefined;
    if (!existing.unlimited && existing.useCount >= existing.maxUses) return undefined;
    const updated: InvitationTokenRecord = { ...existing, useCount: existing.useCount + 1 };
    this.invitationTokens.set(id, updated);
    return updated;
  }

  revokeInvitationToken(id: string, reason: string): InvitationTokenRecord | undefined {
    const existing = this.invitationTokens.get(id);
    if (!existing) return undefined;
    if (existing.revokedAt) return existing;
    const updated: InvitationTokenRecord = {
      ...existing,
      revokedAt: nowIso(),
      revokedReason: reason,
    };
    this.invitationTokens.set(id, updated);
    return updated;
  }

  createInvitationRedemption(
    input: Omit<InvitationRedemptionRecord, 'createdAt'>,
  ): InvitationRedemptionRecord {
    const record: InvitationRedemptionRecord = { ...input, createdAt: nowIso() };
    this.invitationRedemptions.set(record.id, record);
    return record;
  }

  listInvitationRedemptionsByToken(invitationTokenId: string): InvitationRedemptionRecord[] {
    return [...this.invitationRedemptions.values()]
      .filter((r) => r.invitationTokenId === invitationTokenId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Best-effort cascade: drop all per-user auth artifacts so a deleted user
   *  cannot retain a usable session. Shared records (messages, forum posts)
   *  are intentionally left alone — anonymization vs. preservation is a
   *  product-policy choice the caller can layer on top. */
  purgeUserAuthArtifacts(userId: string): void {
    for (const [id, record] of this.passwordResetTokens) {
      if (record.userId === userId) this.passwordResetTokens.delete(id);
    }
    for (const [id, record] of this.emailVerificationTokens) {
      if (record.userId === userId) this.emailVerificationTokens.delete(id);
    }
    for (const [id, record] of this.accountDeletionTokens) {
      if (record.userId === userId) this.accountDeletionTokens.delete(id);
    }
    for (const [id, record] of this.refreshTokens) {
      if (record.userId === userId) this.refreshTokens.delete(id);
    }
    for (const key of [...this.linkedAccounts.keys()]) {
      const record = this.linkedAccounts.get(key);
      if (record?.blackoutUserId === userId) this.linkedAccounts.delete(key);
    }
    for (const [stateHash, record] of this.pendingOAuthLinks) {
      if (record.blackoutUserId === userId) this.pendingOAuthLinks.delete(stateHash);
    }
  }

  // --- refresh tokens ---

  createRefreshToken(input: Omit<RefreshTokenRecord, 'createdAt'>): RefreshTokenRecord {
    const record: RefreshTokenRecord = { ...input, createdAt: nowIso() };
    this.refreshTokens.set(record.id, record);
    return record;
  }

  findRefreshTokenByHash(tokenHash: string): RefreshTokenRecord | undefined {
    return [...this.refreshTokens.values()].find((t) => t.tokenHash === tokenHash);
  }

  markRefreshTokenReplaced(id: string, replacedBy: string): RefreshTokenRecord | undefined {
    const existing = this.refreshTokens.get(id);
    if (!existing) return undefined;
    const updated: RefreshTokenRecord = { ...existing, replacedBy, revokedAt: nowIso(), revokedReason: 'rotated' };
    this.refreshTokens.set(id, updated);
    return updated;
  }

  revokeRefreshTokenFamily(familyId: string, reason: string): number {
    const ts = nowIso();
    let revoked = 0;
    for (const [id, record] of this.refreshTokens) {
      if (record.familyId === familyId && !record.revokedAt) {
        this.refreshTokens.set(id, { ...record, revokedAt: ts, revokedReason: reason });
        revoked += 1;
      }
    }
    return revoked;
  }

  revokeRefreshTokensForUser(userId: string, reason: string): number {
    const ts = nowIso();
    let revoked = 0;
    for (const [id, record] of this.refreshTokens) {
      if (record.userId === userId && !record.revokedAt) {
        this.refreshTokens.set(id, { ...record, revokedAt: ts, revokedReason: reason });
        revoked += 1;
      }
    }
    return revoked;
  }

  // --- revoked sessions ---

  revokeSession(input: Omit<RevokedSessionRecord, 'revokedAt'>): RevokedSessionRecord {
    const record: RevokedSessionRecord = { ...input, revokedAt: nowIso() };
    this.revokedSessions.set(record.jti, record);
    return record;
  }

  isSessionRevoked(jti: string): boolean {
    const record = this.revokedSessions.get(jti);
    if (!record) return false;
    return new Date(record.expiresAt).getTime() > Date.now();
  }

  pruneExpiredRevokedSessions(now: Date = new Date()): number {
    let removed = 0;
    for (const [jti, record] of this.revokedSessions) {
      if (new Date(record.expiresAt).getTime() <= now.getTime()) {
        this.revokedSessions.delete(jti);
        removed += 1;
      }
    }
    return removed;
  }

  // --- linked accounts (third-party OAuth identity links) ---

  private linkedAccountKey(userId: string, provider: LinkedAccountProvider): string {
    return `${userId}:${provider}`;
  }

  upsertLinkedAccount(
    input: Omit<LinkedAccountRecord, 'createdAt' | 'updatedAt'>,
  ): LinkedAccountRecord {
    const key = this.linkedAccountKey(input.blackoutUserId, input.provider);
    const existing = this.linkedAccounts.get(key);
    const now = nowIso();
    const record: LinkedAccountRecord = existing
      ? { ...existing, ...input, createdAt: existing.createdAt, updatedAt: now }
      : { ...input, createdAt: now, updatedAt: now };
    this.linkedAccounts.set(key, record);
    return record;
  }

  getLinkedAccount(
    userId: string,
    provider: LinkedAccountProvider,
  ): LinkedAccountRecord | undefined {
    return this.linkedAccounts.get(this.linkedAccountKey(userId, provider));
  }

  listLinkedAccountsForUser(userId: string): LinkedAccountRecord[] {
    return [...this.linkedAccounts.values()].filter((row) => row.blackoutUserId === userId);
  }

  /** Used by polling-style schedulers (Streamlabs sync, YouTube live chat) to walk every link. */
  listAllLinkedAccountsForProvider(provider: LinkedAccountProvider): LinkedAccountRecord[] {
    return [...this.linkedAccounts.values()].filter((row) => row.provider === provider);
  }

  deleteLinkedAccount(userId: string, provider: LinkedAccountProvider): boolean {
    return this.linkedAccounts.delete(this.linkedAccountKey(userId, provider));
  }

  /**
   * Persist a per-link sync cursor (e.g. Streamlabs donation_id, YouTube
   * pageToken). No-op when there is no link for the (user, provider).
   */
  setLinkedAccountSyncCursor(
    userId: string,
    provider: LinkedAccountProvider,
    cursor: string | undefined,
  ): LinkedAccountRecord | undefined {
    const key = this.linkedAccountKey(userId, provider);
    const existing = this.linkedAccounts.get(key);
    if (!existing) return undefined;
    const updated: LinkedAccountRecord = {
      ...existing,
      syncCursor: cursor,
      updatedAt: nowIso(),
    };
    this.linkedAccounts.set(key, updated);
    return updated;
  }

  // --- pending OAuth link state (PKCE + CSRF) ---

  createPendingOAuthLink(
    input: Omit<PendingOAuthLinkRecord, 'createdAt'>,
  ): PendingOAuthLinkRecord {
    const record: PendingOAuthLinkRecord = { ...input, createdAt: nowIso() };
    this.pendingOAuthLinks.set(record.stateHash, record);
    return record;
  }

  consumePendingOAuthLink(stateHash: string): PendingOAuthLinkRecord | undefined {
    const existing = this.pendingOAuthLinks.get(stateHash);
    if (!existing) return undefined;
    if (existing.consumedAt) return undefined;
    if (new Date(existing.expiresAt).getTime() <= Date.now()) return undefined;
    const updated: PendingOAuthLinkRecord = { ...existing, consumedAt: nowIso() };
    this.pendingOAuthLinks.set(stateHash, updated);
    return updated;
  }

  prunePendingOAuthLinks(now: Date = new Date()): number {
    let removed = 0;
    for (const [hash, record] of this.pendingOAuthLinks) {
      if (new Date(record.expiresAt).getTime() <= now.getTime()) {
        this.pendingOAuthLinks.delete(hash);
        removed += 1;
      }
    }
    return removed;
  }

  // --- twitch chat bridges (Phase 1 / Track A) ---

  createTwitchChatBridge(
    input: Omit<TwitchChatBridgeRecord, 'createdAt' | 'updatedAt'>,
  ): TwitchChatBridgeRecord {
    const now = nowIso();
    const record: TwitchChatBridgeRecord = { ...input, createdAt: now, updatedAt: now };
    this.twitchChatBridges.set(record.id, record);
    return record;
  }

  getTwitchChatBridge(id: string): TwitchChatBridgeRecord | undefined {
    return this.twitchChatBridges.get(id);
  }

  findTwitchChatBridge(
    blackoutUserId: string,
    twitchChannel: string,
  ): TwitchChatBridgeRecord | undefined {
    const ch = twitchChannel.toLowerCase();
    return [...this.twitchChatBridges.values()].find(
      (row) => row.blackoutUserId === blackoutUserId && row.twitchChannel === ch,
    );
  }

  listTwitchChatBridgesForUser(blackoutUserId: string): TwitchChatBridgeRecord[] {
    return [...this.twitchChatBridges.values()].filter(
      (row) => row.blackoutUserId === blackoutUserId,
    );
  }

  listActiveTwitchChatBridges(): TwitchChatBridgeRecord[] {
    return [...this.twitchChatBridges.values()].filter((row) => row.isActive);
  }

  updateTwitchChatBridge(
    id: string,
    patch: Partial<Omit<TwitchChatBridgeRecord, 'id' | 'createdAt'>>,
  ): TwitchChatBridgeRecord | undefined {
    const existing = this.twitchChatBridges.get(id);
    if (!existing) return undefined;
    const updated: TwitchChatBridgeRecord = { ...existing, ...patch, updatedAt: nowIso() };
    this.twitchChatBridges.set(id, updated);
    return updated;
  }

  deleteTwitchChatBridge(id: string): boolean {
    return this.twitchChatBridges.delete(id);
  }

  // --- twitch eventsub subscriptions ---

  createTwitchEventSubscription(
    input: Omit<TwitchEventSubscriptionRecord, 'createdAt' | 'updatedAt'>,
  ): TwitchEventSubscriptionRecord {
    const now = nowIso();
    const record: TwitchEventSubscriptionRecord = { ...input, createdAt: now, updatedAt: now };
    this.twitchEventSubscriptions.set(record.helixSubscriptionId, record);
    return record;
  }

  getTwitchEventSubscriptionByHelixId(
    helixId: string,
  ): TwitchEventSubscriptionRecord | undefined {
    return this.twitchEventSubscriptions.get(helixId);
  }

  listTwitchEventSubscriptionsForChannel(
    blackoutUserId: string,
    twitchUserId: string,
  ): TwitchEventSubscriptionRecord[] {
    return [...this.twitchEventSubscriptions.values()].filter(
      (row) => row.blackoutUserId === blackoutUserId && row.twitchUserId === twitchUserId,
    );
  }

  updateTwitchEventSubscriptionStatus(
    helixId: string,
    status: string,
  ): TwitchEventSubscriptionRecord | undefined {
    const existing = this.twitchEventSubscriptions.get(helixId);
    if (!existing) return undefined;
    const updated: TwitchEventSubscriptionRecord = {
      ...existing,
      status,
      updatedAt: nowIso(),
    };
    this.twitchEventSubscriptions.set(helixId, updated);
    return updated;
  }

  deleteTwitchEventSubscription(helixId: string): boolean {
    return this.twitchEventSubscriptions.delete(helixId);
  }

  // --- widget alert tokens (Phase 1 / Track A) ---

  createWidgetAlertToken(
    input: Omit<WidgetAlertTokenRecord, 'createdAt'>,
  ): WidgetAlertTokenRecord {
    const record: WidgetAlertTokenRecord = { ...input, createdAt: nowIso() };
    this.widgetAlertTokens.set(record.secretHash, record);
    return record;
  }

  getWidgetAlertTokenById(id: string): WidgetAlertTokenRecord | undefined {
    return [...this.widgetAlertTokens.values()].find((row) => row.id === id);
  }

  /** Returns the active (non-revoked) token matching the bearer hash, or undefined. */
  findActiveWidgetAlertTokenByHash(
    secretHash: string,
  ): WidgetAlertTokenRecord | undefined {
    const row = this.widgetAlertTokens.get(secretHash);
    if (!row || row.revokedAt) return undefined;
    return row;
  }

  listWidgetAlertTokensForUser(
    blackoutUserId: string,
  ): WidgetAlertTokenRecord[] {
    return [...this.widgetAlertTokens.values()].filter(
      (row) => row.blackoutUserId === blackoutUserId,
    );
  }

  revokeWidgetAlertToken(
    id: string,
    reason: string,
  ): WidgetAlertTokenRecord | undefined {
    const existing = this.getWidgetAlertTokenById(id);
    if (!existing || existing.revokedAt) return undefined;
    const updated: WidgetAlertTokenRecord = {
      ...existing,
      revokedAt: nowIso(),
      revokedReason: reason,
    };
    this.widgetAlertTokens.set(updated.secretHash, updated);
    return updated;
  }

  touchWidgetAlertTokenDelivered(
    secretHash: string,
  ): WidgetAlertTokenRecord | undefined {
    const existing = this.widgetAlertTokens.get(secretHash);
    if (!existing) return undefined;
    const updated: WidgetAlertTokenRecord = {
      ...existing,
      lastDeliveredAt: nowIso(),
    };
    this.widgetAlertTokens.set(secretHash, updated);
    return updated;
  }

  // --- youtube chat bridges (Phase 1 / Track A) ---

  createYoutubeChatBridge(
    input: Omit<YoutubeChatBridgeRecord, 'createdAt' | 'updatedAt'>,
  ): YoutubeChatBridgeRecord {
    const now = nowIso();
    const record: YoutubeChatBridgeRecord = { ...input, createdAt: now, updatedAt: now };
    this.youtubeChatBridges.set(record.id, record);
    return record;
  }

  getYoutubeChatBridge(id: string): YoutubeChatBridgeRecord | undefined {
    return this.youtubeChatBridges.get(id);
  }

  findYoutubeChatBridge(
    blackoutUserId: string,
    youtubeChannelId: string,
  ): YoutubeChatBridgeRecord | undefined {
    return [...this.youtubeChatBridges.values()].find(
      (row) =>
        row.blackoutUserId === blackoutUserId && row.youtubeChannelId === youtubeChannelId,
    );
  }

  listYoutubeChatBridgesForUser(blackoutUserId: string): YoutubeChatBridgeRecord[] {
    return [...this.youtubeChatBridges.values()].filter(
      (row) => row.blackoutUserId === blackoutUserId,
    );
  }

  listActiveYoutubeChatBridges(): YoutubeChatBridgeRecord[] {
    return [...this.youtubeChatBridges.values()].filter((row) => row.isActive);
  }

  updateYoutubeChatBridge(
    id: string,
    patch: Partial<Omit<YoutubeChatBridgeRecord, 'id' | 'createdAt'>>,
  ): YoutubeChatBridgeRecord | undefined {
    const existing = this.youtubeChatBridges.get(id);
    if (!existing) return undefined;
    const updated: YoutubeChatBridgeRecord = { ...existing, ...patch, updatedAt: nowIso() };
    this.youtubeChatBridges.set(id, updated);
    return updated;
  }

  deleteYoutubeChatBridge(id: string): boolean {
    return this.youtubeChatBridges.delete(id);
  }

  // --- kick chat bridges (Phase 1 / Track A) ---

  createKickChatBridge(
    input: Omit<KickChatBridgeRecord, 'createdAt' | 'updatedAt'>,
  ): KickChatBridgeRecord {
    const now = nowIso();
    const record: KickChatBridgeRecord = { ...input, createdAt: now, updatedAt: now };
    this.kickChatBridges.set(record.id, record);
    return record;
  }

  getKickChatBridge(id: string): KickChatBridgeRecord | undefined {
    return this.kickChatBridges.get(id);
  }

  findKickChatBridge(
    blackoutUserId: string,
    kickChatroomId: string,
  ): KickChatBridgeRecord | undefined {
    return [...this.kickChatBridges.values()].find(
      (row) =>
        row.blackoutUserId === blackoutUserId && row.kickChatroomId === kickChatroomId,
    );
  }

  listKickChatBridgesForUser(blackoutUserId: string): KickChatBridgeRecord[] {
    return [...this.kickChatBridges.values()].filter(
      (row) => row.blackoutUserId === blackoutUserId,
    );
  }

  listActiveKickChatBridges(): KickChatBridgeRecord[] {
    return [...this.kickChatBridges.values()].filter((row) => row.isActive);
  }

  updateKickChatBridge(
    id: string,
    patch: Partial<Omit<KickChatBridgeRecord, 'id' | 'createdAt'>>,
  ): KickChatBridgeRecord | undefined {
    const existing = this.kickChatBridges.get(id);
    if (!existing) return undefined;
    const updated: KickChatBridgeRecord = { ...existing, ...patch, updatedAt: nowIso() };
    this.kickChatBridges.set(id, updated);
    return updated;
  }

  deleteKickChatBridge(id: string): boolean {
    return this.kickChatBridges.delete(id);
  }

  // --- discord-compatible incoming webhooks (Phase 2 / Track B) ---

  createDiscordCompatWebhook(
    input: Omit<DiscordCompatWebhookRecord, 'createdAt' | 'updatedAt'>,
  ): DiscordCompatWebhookRecord {
    const now = nowIso();
    const record: DiscordCompatWebhookRecord = { ...input, createdAt: now, updatedAt: now };
    this.discordCompatWebhooks.set(record.id, record);
    return record;
  }

  getDiscordCompatWebhook(id: string): DiscordCompatWebhookRecord | undefined {
    return this.discordCompatWebhooks.get(id);
  }

  listDiscordCompatWebhooksForUser(blackoutUserId: string): DiscordCompatWebhookRecord[] {
    return [...this.discordCompatWebhooks.values()].filter(
      (row) => row.blackoutUserId === blackoutUserId,
    );
  }

  updateDiscordCompatWebhook(
    id: string,
    patch: Partial<Omit<DiscordCompatWebhookRecord, 'id' | 'createdAt'>>,
  ): DiscordCompatWebhookRecord | undefined {
    const existing = this.discordCompatWebhooks.get(id);
    if (!existing) return undefined;
    const updated: DiscordCompatWebhookRecord = { ...existing, ...patch, updatedAt: nowIso() };
    this.discordCompatWebhooks.set(id, updated);
    return updated;
  }

  deleteDiscordCompatWebhook(id: string): boolean {
    return this.discordCompatWebhooks.delete(id);
  }

  // --- outbound event webhooks (Phase 2 / Track B) ---

  createOutboundEventWebhook(
    input: Omit<OutboundEventWebhookRecord, 'createdAt' | 'updatedAt'>,
  ): OutboundEventWebhookRecord {
    const now = nowIso();
    const record: OutboundEventWebhookRecord = { ...input, createdAt: now, updatedAt: now };
    this.outboundEventWebhooks.set(record.id, record);
    return record;
  }

  getOutboundEventWebhook(id: string): OutboundEventWebhookRecord | undefined {
    return this.outboundEventWebhooks.get(id);
  }

  listOutboundEventWebhooksForUser(blackoutUserId: string): OutboundEventWebhookRecord[] {
    return [...this.outboundEventWebhooks.values()].filter(
      (row) => row.blackoutUserId === blackoutUserId,
    );
  }

  /** All active subscriptions across all users — the delivery loop iterates this. */
  listActiveOutboundEventWebhooks(): OutboundEventWebhookRecord[] {
    return [...this.outboundEventWebhooks.values()].filter((row) => row.isActive);
  }

  updateOutboundEventWebhook(
    id: string,
    patch: Partial<Omit<OutboundEventWebhookRecord, 'id' | 'createdAt'>>,
  ): OutboundEventWebhookRecord | undefined {
    const existing = this.outboundEventWebhooks.get(id);
    if (!existing) return undefined;
    const updated: OutboundEventWebhookRecord = { ...existing, ...patch, updatedAt: nowIso() };
    this.outboundEventWebhooks.set(id, updated);
    return updated;
  }

  deleteOutboundEventWebhook(id: string): boolean {
    return this.outboundEventWebhooks.delete(id);
  }

  // --- twitch irc bot tokens (Phase 2 / Track B) ---

  createTwitchIrcBotToken(
    input: Omit<TwitchIrcBotTokenRecord, 'createdAt' | 'updatedAt'>,
  ): TwitchIrcBotTokenRecord {
    const now = nowIso();
    const record: TwitchIrcBotTokenRecord = { ...input, createdAt: now, updatedAt: now };
    this.twitchIrcBotTokens.set(record.id, record);
    return record;
  }

  getTwitchIrcBotToken(id: string): TwitchIrcBotTokenRecord | undefined {
    return this.twitchIrcBotTokens.get(id);
  }

  /** Used by the connection authenticator to verify a presented PASS. */
  findActiveTwitchIrcBotTokenByHash(secretHash: string): TwitchIrcBotTokenRecord | undefined {
    return [...this.twitchIrcBotTokens.values()].find(
      (row) => row.isActive && row.secretHash === secretHash,
    );
  }

  listTwitchIrcBotTokensForUser(blackoutUserId: string): TwitchIrcBotTokenRecord[] {
    return [...this.twitchIrcBotTokens.values()].filter(
      (row) => row.blackoutUserId === blackoutUserId,
    );
  }

  revokeTwitchIrcBotToken(id: string, reason: string): TwitchIrcBotTokenRecord | undefined {
    const existing = this.twitchIrcBotTokens.get(id);
    if (!existing) return undefined;
    const updated: TwitchIrcBotTokenRecord = {
      ...existing,
      isActive: false,
      revokedAt: nowIso(),
      revokeReason: reason,
      updatedAt: nowIso(),
    };
    this.twitchIrcBotTokens.set(id, updated);
    return updated;
  }

  /**
   * Bump diagnostics on a successful authenticated bot connection. Bumps
   * are in-memory-only on the file-backed db (touching the JSON store on
   * every IRC auth would be a write amplification bomb).
   */
  touchTwitchIrcBotTokenUsed(id: string): void {
    const existing = this.twitchIrcBotTokens.get(id);
    if (!existing) return;
    this.twitchIrcBotTokens.set(id, {
      ...existing,
      lastUsedAt: nowIso(),
      useCount: existing.useCount + 1,
    });
  }

  deleteTwitchIrcBotToken(id: string): boolean {
    return this.twitchIrcBotTokens.delete(id);
  }

  // --- obs-ws passwords (Phase 3 / Track B) ---

  createObsWsPassword(
    input: Omit<ObsWsPasswordRecord, 'createdAt' | 'updatedAt'>,
  ): ObsWsPasswordRecord {
    const now = nowIso();
    const record: ObsWsPasswordRecord = { ...input, createdAt: now, updatedAt: now };
    this.obsWsPasswords.set(record.id, record);
    return record;
  }

  getObsWsPassword(id: string): ObsWsPasswordRecord | undefined {
    return this.obsWsPasswords.get(id);
  }

  /**
   * Used by the OBS-WS shim's URL-based authenticator. Only returns the
   * row if it's still active so revocation takes effect immediately.
   */
  getActiveObsWsPassword(id: string): ObsWsPasswordRecord | undefined {
    const row = this.obsWsPasswords.get(id);
    return row && row.isActive ? row : undefined;
  }

  listObsWsPasswordsForUser(blackoutUserId: string): ObsWsPasswordRecord[] {
    return [...this.obsWsPasswords.values()].filter(
      (row) => row.blackoutUserId === blackoutUserId,
    );
  }

  revokeObsWsPassword(id: string, reason: string): ObsWsPasswordRecord | undefined {
    const existing = this.obsWsPasswords.get(id);
    if (!existing) return undefined;
    const updated: ObsWsPasswordRecord = {
      ...existing,
      isActive: false,
      revokedAt: nowIso(),
      revokeReason: reason,
      updatedAt: nowIso(),
    };
    this.obsWsPasswords.set(id, updated);
    return updated;
  }

  /**
   * Bump diagnostics on a successful authenticated OBS-WS connection.
   * In-memory only on the file-backed db (write amplification on every
   * connection would thrash the JSON store).
   */
  touchObsWsPasswordUsed(id: string): void {
    const existing = this.obsWsPasswords.get(id);
    if (!existing) return;
    this.obsWsPasswords.set(id, {
      ...existing,
      lastUsedAt: nowIso(),
      useCount: existing.useCount + 1,
    });
  }

  deleteObsWsPassword(id: string): boolean {
    return this.obsWsPasswords.delete(id);
  }

  // --- simulcast destinations (Phase 1 / Track A) ---

  createSimulcastDestination(
    input: Omit<SimulcastDestinationRecord, 'createdAt' | 'updatedAt'>,
  ): SimulcastDestinationRecord {
    const now = nowIso();
    const record: SimulcastDestinationRecord = { ...input, createdAt: now, updatedAt: now };
    this.simulcastDestinations.set(record.id, record);
    return record;
  }

  getSimulcastDestination(id: string): SimulcastDestinationRecord | undefined {
    return this.simulcastDestinations.get(id);
  }

  listSimulcastDestinationsForUser(
    blackoutUserId: string,
  ): SimulcastDestinationRecord[] {
    return [...this.simulcastDestinations.values()].filter(
      (row) => row.blackoutUserId === blackoutUserId,
    );
  }

  listEnabledSimulcastDestinations(): SimulcastDestinationRecord[] {
    return [...this.simulcastDestinations.values()].filter((row) => row.isEnabled);
  }

  updateSimulcastDestination(
    id: string,
    patch: Partial<Omit<SimulcastDestinationRecord, 'id' | 'createdAt'>>,
  ): SimulcastDestinationRecord | undefined {
    const existing = this.simulcastDestinations.get(id);
    if (!existing) return undefined;
    const updated: SimulcastDestinationRecord = {
      ...existing,
      ...patch,
      updatedAt: nowIso(),
    };
    this.simulcastDestinations.set(id, updated);
    return updated;
  }

  deleteSimulcastDestination(id: string): boolean {
    return this.simulcastDestinations.delete(id);
  }

  upsertCanopyDirectoryEntry(
    input: Omit<CanopyDirectoryEntryRecord, 'indexedAt'>,
  ): CanopyDirectoryEntryRecord {
    const record: CanopyDirectoryEntryRecord = { ...input, indexedAt: nowIso() };
    this.canopyDirectoryEntries.set(record.canopyId, record);
    return record;
  }

  getCanopyDirectoryEntry(canopyId: string): CanopyDirectoryEntryRecord | undefined {
    return this.canopyDirectoryEntries.get(canopyId);
  }

  listCanopyDirectoryEntries(): CanopyDirectoryEntryRecord[] {
    return [...this.canopyDirectoryEntries.values()];
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

  createScheduledMessage(
    input: Omit<ScheduledMessageRecord, 'createdAt' | 'status' | 'attempts' | 'deliveredAt' | 'lastError'>,
  ): ScheduledMessageRecord {
    const record: ScheduledMessageRecord = {
      ...input,
      status: 'pending',
      attempts: 0,
      createdAt: nowIso(),
    };
    this.scheduledMessages.set(record.id, record);
    return record;
  }

  getScheduledMessage(id: string): ScheduledMessageRecord | undefined {
    return this.scheduledMessages.get(id);
  }

  listPendingScheduledMessagesForUser(userId: string): ScheduledMessageRecord[] {
    return [...this.scheduledMessages.values()]
      .filter((msg) => msg.userId === userId && msg.status === 'pending')
      .sort((a, b) => (a.deliverAt < b.deliverAt ? -1 : 1));
  }

  /** Pending messages whose deliverAt is at or before `asOf` (defaults to now). */
  listDueScheduledMessages(asOf: string = nowIso()): ScheduledMessageRecord[] {
    return [...this.scheduledMessages.values()]
      .filter((msg) => msg.status === 'pending' && msg.deliverAt <= asOf)
      .sort((a, b) => (a.deliverAt < b.deliverAt ? -1 : 1));
  }

  markScheduledMessageDelivered(id: string): ScheduledMessageRecord | undefined {
    const record = this.scheduledMessages.get(id);
    if (!record) return undefined;
    const updated: ScheduledMessageRecord = {
      ...record,
      status: 'delivered',
      attempts: record.attempts + 1,
      deliveredAt: nowIso(),
      lastError: undefined,
    };
    this.scheduledMessages.set(id, updated);
    return updated;
  }

  /**
   * Record a failed delivery attempt. Stays `pending` (so the dispatcher
   * retries on a later tick) unless `terminal` is set, which marks it `failed`.
   */
  markScheduledMessageFailed(
    id: string,
    error: string,
    options: { terminal?: boolean } = {},
  ): ScheduledMessageRecord | undefined {
    const record = this.scheduledMessages.get(id);
    if (!record) return undefined;
    const updated: ScheduledMessageRecord = {
      ...record,
      status: options.terminal ? 'failed' : 'pending',
      attempts: record.attempts + 1,
      lastError: error,
    };
    this.scheduledMessages.set(id, updated);
    return updated;
  }

  /** Cancel a still-pending scheduled message owned by `userId`. */
  cancelScheduledMessage(id: string, userId: string): ScheduledMessageRecord | undefined {
    const record = this.scheduledMessages.get(id);
    if (!record || record.userId !== userId || record.status !== 'pending') return undefined;
    const updated: ScheduledMessageRecord = { ...record, status: 'cancelled' };
    this.scheduledMessages.set(id, updated);
    return updated;
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

  createDeadmanSwitch(input: Omit<DeadmanSwitchRecord, 'createdAt' | 'updatedAt'>): DeadmanSwitchRecord {
    const ts = nowIso();
    const record: DeadmanSwitchRecord = { ...input, createdAt: ts, updatedAt: ts };
    this.deadmanSwitches.set(record.id, record);
    return record;
  }

  getDeadmanSwitch(id: string): DeadmanSwitchRecord | undefined {
    return this.deadmanSwitches.get(id);
  }

  listDeadmanSwitchesForOwner(ownerId: string): DeadmanSwitchRecord[] {
    return [...this.deadmanSwitches.values()].filter((entry) => entry.ownerId === ownerId);
  }

  listDeadmanSwitchesForRecipient(recipient: string): DeadmanSwitchRecord[] {
    return [...this.deadmanSwitches.values()].filter((entry) =>
      entry.recipients.includes(recipient)
    );
  }

  listAllDeadmanSwitches(): DeadmanSwitchRecord[] {
    return [...this.deadmanSwitches.values()];
  }

  updateDeadmanSwitch(
    id: string,
    patch: Partial<Omit<DeadmanSwitchRecord, 'id' | 'createdAt'>>
  ): DeadmanSwitchRecord | undefined {
    const existing = this.deadmanSwitches.get(id);
    if (!existing) return undefined;
    const next: DeadmanSwitchRecord = { ...existing, ...patch, updatedAt: nowIso() };
    this.deadmanSwitches.set(id, next);
    return next;
  }

  setDeadmanSwitchStatus(
    id: string,
    status: DeadmanSwitchStatus
  ): DeadmanSwitchRecord | undefined {
    return this.updateDeadmanSwitch(id, { status });
  }

  createModerationAction(input: Omit<ModerationActionRecord, 'createdAt'>): ModerationActionRecord {
    const record: ModerationActionRecord = { ...input, createdAt: nowIso() };
    this.moderationActions.set(record.id, record);
    return record;
  }

  listModerationActions(communityId: string): ModerationActionRecord[] {
    return [...this.moderationActions.values()].filter((action) => action.communityId === communityId);
  }

  upsertCreatorStreamAuth(input: Omit<CreatorStreamAuthRecord, 'createdAt' | 'rotatedAt'>): CreatorStreamAuthRecord {
    const existing = [...this.creatorStreamAuth.values()].find((record) => record.creatorId === input.creatorId);
    const record: CreatorStreamAuthRecord = {
      ...input,
      id: existing?.id ?? input.id,
      createdAt: existing?.createdAt ?? nowIso(),
      rotatedAt: nowIso(),
    };
    this.creatorStreamAuth.set(record.id, record);
    return record;
  }

  getCreatorStreamAuth(creatorId: string): CreatorStreamAuthRecord | undefined {
    return [...this.creatorStreamAuth.values()].find((record) => record.creatorId === creatorId);
  }

  upsertStream(input: Omit<StreamRecord, 'createdAt' | 'updatedAt'>): StreamRecord {
    const existing = this.streams.get(input.id);
    const record: StreamRecord = {
      ...input,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    this.streams.set(record.id, record);
    return record;
  }

  getStream(streamId: string): StreamRecord | undefined {
    return this.streams.get(streamId);
  }

  listStreamsByCreator(creatorId: string): StreamRecord[] {
    return [...this.streams.values()].filter((stream) => stream.creatorId === creatorId);
  }

  listAllStreams(): StreamRecord[] {
    return [...this.streams.values()];
  }

  createStreamSession(input: Omit<StreamSessionRecord, 'createdAt'>): StreamSessionRecord {
    const record: StreamSessionRecord = { ...input, createdAt: nowIso() };
    this.streamSessions.set(record.id, record);
    return record;
  }

  getStreamSession(sessionId: string): StreamSessionRecord | undefined {
    return this.streamSessions.get(sessionId);
  }

  endStreamSession(sessionId: string, replayPointer?: string): StreamSessionRecord | undefined {
    const existing = this.streamSessions.get(sessionId);
    if (!existing) return undefined;

    const updated: StreamSessionRecord = {
      ...existing,
      endedAt: existing.endedAt ?? nowIso(),
      replayPointer: replayPointer ?? existing.replayPointer,
    };
    this.streamSessions.set(sessionId, updated);
    return updated;
  }

  listStreamSessions(streamId: string): StreamSessionRecord[] {
    return [...this.streamSessions.values()]
      .filter((session) => session.streamId === streamId)
      .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  }

  upsertStreamModeration(input: Omit<StreamModerationRecord, 'updatedAt'>): StreamModerationRecord {
    const record: StreamModerationRecord = {
      ...input,
      updatedAt: nowIso(),
    };
    this.streamModeration.set(record.streamId, record);
    return record;
  }

  getStreamModeration(streamId: string): StreamModerationRecord | undefined {
    return this.streamModeration.get(streamId);
  }

  upsertClip(input: Omit<ClipRecord, 'createdAt' | 'updatedAt'>): ClipRecord {
    const existing = this.clips.get(input.id);
    const record: ClipRecord = {
      ...input,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    this.clips.set(record.id, record);
    return record;
  }

  getClip(clipId: string): ClipRecord | undefined {
    return this.clips.get(clipId);
  }

  deleteClip(clipId: string): boolean {
    return this.clips.delete(clipId);
  }

  listClips(options: { creatorId?: string; limit?: number } = {}): ClipRecord[] {
    const { creatorId, limit } = options;
    const items = [...this.clips.values()]
      .filter((clip) => (creatorId ? clip.creatorId === creatorId : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return typeof limit === 'number' ? items.slice(0, limit) : items;
  }

  listClipsBySourceStream(sourceStreamId: string): ClipRecord[] {
    return [...this.clips.values()]
      .filter((clip) => clip.sourceStreamId === sourceStreamId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

  upsertMarketplaceEntitlement(
    record: MarketplaceEntitlementRecord
  ): MarketplaceEntitlementRecord {
    this.marketplaceEntitlements.set(record.id, record);
    return record;
  }

  getMarketplaceEntitlement(id: string): MarketplaceEntitlementRecord | undefined {
    return this.marketplaceEntitlements.get(id);
  }

  listMarketplaceEntitlementsByUser(userId: string): MarketplaceEntitlementRecord[] {
    return [...this.marketplaceEntitlements.values()].filter((row) => row.userId === userId);
  }

  findMarketplaceEntitlement(criteria: {
    userId: string;
    providerId: MarketplaceProviderIdString;
    providerListingId: string;
    sku: string | null;
  }): MarketplaceEntitlementRecord | undefined {
    return [...this.marketplaceEntitlements.values()].find(
      (row) =>
        row.userId === criteria.userId &&
        row.providerId === criteria.providerId &&
        row.providerListingId === criteria.providerListingId &&
        (criteria.sku === null ? true : row.sku === criteria.sku)
    );
  }

  recordMarketplaceWebhook(
    record: MarketplaceWebhookAuditRecord
  ): MarketplaceWebhookAuditRecord {
    this.marketplaceWebhookAudit.set(this.webhookKey(record.providerId, record.eventId), record);
    return record;
  }

  markMarketplaceWebhookProcessed(
    providerId: MarketplaceProviderIdString,
    eventId: string,
    processedAt: string
  ): MarketplaceWebhookAuditRecord | undefined {
    const key = this.webhookKey(providerId, eventId);
    const existing = this.marketplaceWebhookAudit.get(key);
    if (!existing) return undefined;
    const updated = { ...existing, processedAt };
    this.marketplaceWebhookAudit.set(key, updated);
    return updated;
  }

  getMarketplaceWebhook(
    providerId: MarketplaceProviderIdString,
    eventId: string
  ): MarketplaceWebhookAuditRecord | undefined {
    return this.marketplaceWebhookAudit.get(this.webhookKey(providerId, eventId));
  }

  upsertMarketplaceLicenseKey(
    record: MarketplaceLicenseKeyRecord
  ): MarketplaceLicenseKeyRecord {
    this.marketplaceLicenseKeys.set(record.entitlementId, record);
    return record;
  }

  getMarketplaceLicenseKey(entitlementId: string): MarketplaceLicenseKeyRecord | undefined {
    return this.marketplaceLicenseKeys.get(entitlementId);
  }

  upsertMarketplaceListingsCache(
    record: MarketplaceListingsCacheRecord
  ): MarketplaceListingsCacheRecord {
    this.marketplaceListingsCache.set(record.cacheKey, record);
    return record;
  }

  getMarketplaceListingsCache(cacheKey: string): MarketplaceListingsCacheRecord | undefined {
    return this.marketplaceListingsCache.get(cacheKey);
  }

  resetMarketplaceForTest(): void {
    this.marketplaceEntitlements.clear();
    this.marketplaceWebhookAudit.clear();
    this.marketplaceLicenseKeys.clear();
    this.marketplaceListingsCache.clear();
  }

  insertTip(record: TipRecord): TipRecord {
    this.tips.set(record.id, record);
    return record;
  }

  updateTip(record: TipRecord): TipRecord {
    this.tips.set(record.id, record);
    return record;
  }

  getTip(id: string): TipRecord | undefined {
    return this.tips.get(id);
  }

  findTipByOrderId(
    providerId: MarketplaceProviderIdString,
    fbmOrderId: string
  ): TipRecord | undefined {
    return [...this.tips.values()].find(
      (row) => row.providerId === providerId && row.fbmOrderId === fbmOrderId
    );
  }

  listTipsByRecipient(recipientUserId: string, limit = 100): TipRecord[] {
    return [...this.tips.values()]
      .filter((row) => row.recipientUserId === recipientUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  listTipsBySender(senderUserId: string, limit = 100): TipRecord[] {
    return [...this.tips.values()]
      .filter((row) => row.senderUserId === senderUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  resetTipsForTest(): void {
    this.tips.clear();
  }

  insertCreatorSubscriptionTier(record: CreatorSubscriptionTierRecord): CreatorSubscriptionTierRecord {
    this.creatorSubscriptionTiers.set(record.id, record);
    return record;
  }

  updateCreatorSubscriptionTier(record: CreatorSubscriptionTierRecord): CreatorSubscriptionTierRecord {
    this.creatorSubscriptionTiers.set(record.id, record);
    return record;
  }

  getCreatorSubscriptionTier(id: string): CreatorSubscriptionTierRecord | undefined {
    return this.creatorSubscriptionTiers.get(id);
  }

  listCreatorSubscriptionTiersForCreator(creatorUserId: string): CreatorSubscriptionTierRecord[] {
    return [...this.creatorSubscriptionTiers.values()]
      .filter((row) => row.creatorUserId === creatorUserId)
      .sort((a, b) => a.priceCents - b.priceCents);
  }

  insertCreatorSubscription(record: CreatorSubscriptionRecord): CreatorSubscriptionRecord {
    this.creatorSubscriptions.set(record.id, record);
    return record;
  }

  updateCreatorSubscription(record: CreatorSubscriptionRecord): CreatorSubscriptionRecord {
    this.creatorSubscriptions.set(record.id, record);
    return record;
  }

  getCreatorSubscription(id: string): CreatorSubscriptionRecord | undefined {
    return this.creatorSubscriptions.get(id);
  }

  findActiveCreatorSubscription(
    subscriberUserId: string,
    creatorUserId: string
  ): CreatorSubscriptionRecord | undefined {
    return [...this.creatorSubscriptions.values()].find(
      (row) =>
        row.subscriberUserId === subscriberUserId &&
        row.creatorUserId === creatorUserId &&
        row.status === 'active'
    );
  }

  listCreatorSubscriptionsForSubscriber(subscriberUserId: string): CreatorSubscriptionRecord[] {
    return [...this.creatorSubscriptions.values()]
      .filter((row) => row.subscriberUserId === subscriberUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listCreatorSubscriptionsForCreator(creatorUserId: string): CreatorSubscriptionRecord[] {
    return [...this.creatorSubscriptions.values()]
      .filter((row) => row.creatorUserId === creatorUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  resetCreatorSubscriptionsForTest(): void {
    this.creatorSubscriptionTiers.clear();
    this.creatorSubscriptions.clear();
  }

  insertCommunityBoostPledge(record: CommunityBoostPledgeRecord): CommunityBoostPledgeRecord {
    this.communityBoostPledges.set(record.id, record);
    return record;
  }

  updateCommunityBoostPledge(record: CommunityBoostPledgeRecord): CommunityBoostPledgeRecord {
    this.communityBoostPledges.set(record.id, record);
    return record;
  }

  getCommunityBoostPledge(id: string): CommunityBoostPledgeRecord | undefined {
    return this.communityBoostPledges.get(id);
  }

  findActiveBoostPledgeForUser(
    communityId: string,
    pledgerUserId: string
  ): CommunityBoostPledgeRecord | undefined {
    return [...this.communityBoostPledges.values()].find(
      (row) =>
        row.communityId === communityId &&
        row.pledgerUserId === pledgerUserId &&
        row.status === 'active'
    );
  }

  listBoostPledgesForCommunity(communityId: string): CommunityBoostPledgeRecord[] {
    return [...this.communityBoostPledges.values()]
      .filter((row) => row.communityId === communityId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listBoostPledgesByUser(pledgerUserId: string): CommunityBoostPledgeRecord[] {
    return [...this.communityBoostPledges.values()]
      .filter((row) => row.pledgerUserId === pledgerUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  resetCommunityBoostsForTest(): void {
    this.communityBoostPledges.clear();
  }

  insertAidPool(record: AidPoolRecord): AidPoolRecord {
    this.aidPools.set(record.id, record);
    return record;
  }

  updateAidPool(record: AidPoolRecord): AidPoolRecord {
    this.aidPools.set(record.id, record);
    return record;
  }

  getAidPool(id: string): AidPoolRecord | undefined {
    return this.aidPools.get(id);
  }

  listAidPools(): AidPoolRecord[] {
    return [...this.aidPools.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listAidPoolsByOrganizer(organizerUserId: string): AidPoolRecord[] {
    return [...this.aidPools.values()]
      .filter((row) => row.organizerUserId === organizerUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  resetAidPoolsForTest(): void {
    this.aidPools.clear();
  }

  insertAdRevenuePeriod(record: AdRevenuePeriodRecord): AdRevenuePeriodRecord {
    this.adRevenuePeriods.set(record.id, record);
    return record;
  }

  updateAdRevenuePeriod(record: AdRevenuePeriodRecord): AdRevenuePeriodRecord {
    this.adRevenuePeriods.set(record.id, record);
    return record;
  }

  getAdRevenuePeriod(id: string): AdRevenuePeriodRecord | undefined {
    return this.adRevenuePeriods.get(id);
  }

  listAdRevenuePeriods(): AdRevenuePeriodRecord[] {
    return [...this.adRevenuePeriods.values()].sort((a, b) =>
      b.periodStart.localeCompare(a.periodStart)
    );
  }

  insertAdRevenueShare(record: AdRevenueShareRecord): AdRevenueShareRecord {
    this.adRevenueShares.set(record.id, record);
    return record;
  }

  updateAdRevenueShare(record: AdRevenueShareRecord): AdRevenueShareRecord {
    this.adRevenueShares.set(record.id, record);
    return record;
  }

  getAdRevenueShare(id: string): AdRevenueShareRecord | undefined {
    return this.adRevenueShares.get(id);
  }

  listAdRevenueSharesForPeriod(periodId: string): AdRevenueShareRecord[] {
    return [...this.adRevenueShares.values()]
      .filter((row) => row.periodId === periodId)
      .sort((a, b) => b.netCents - a.netCents);
  }

  listAdRevenueSharesForCreator(creatorUserId: string): AdRevenueShareRecord[] {
    return [...this.adRevenueShares.values()]
      .filter((row) => row.creatorUserId === creatorUserId)
      .sort((a, b) => b.computedAt.localeCompare(a.computedAt));
  }

  resetAdRevenueForTest(): void {
    this.adRevenuePeriods.clear();
    this.adRevenueShares.clear();
  }

  private webhookKey(providerId: MarketplaceProviderIdString, eventId: string): string {
    return `${providerId}:${eventId}`;
  }

  // --- coalition spatial map ---

  listCoalitionSpatialItems(): CoalitionSpatialItemRecord[] {
    return [...this.coalitionSpatialItems.values()];
  }

  upsertCoalitionSpatialItem(
    input: Omit<CoalitionSpatialItemRecord, 'createdAt' | 'updatedAt'>,
  ): CoalitionSpatialItemRecord {
    const existing = this.coalitionSpatialItems.get(input.id);
    const now = nowIso();
    const record: CoalitionSpatialItemRecord = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.coalitionSpatialItems.set(record.id, record);
    return record;
  }

  listCoalitionAidPosts(): CoalitionAidPostRecord[] {
    return [...this.coalitionAidPosts.values()];
  }

  createCoalitionAidPost(
    input: Omit<CoalitionAidPostRecord, 'createdAt'>,
  ): CoalitionAidPostRecord {
    const record: CoalitionAidPostRecord = { ...input, createdAt: nowIso() };
    this.coalitionAidPosts.set(record.id, record);
    return record;
  }

  // --- plugin installations (activation-at-scope) ---

  createPluginInstallation(
    input: Omit<PluginInstallationRecord, 'installedAt' | 'updatedAt'>,
  ): PluginInstallationRecord {
    const now = nowIso();
    const record: PluginInstallationRecord = { ...input, installedAt: now, updatedAt: now };
    this.pluginInstallations.set(record.id, record);
    return record;
  }

  getPluginInstallation(id: string): PluginInstallationRecord | undefined {
    return this.pluginInstallations.get(id);
  }

  /** Enforces the (pluginId, scopeType, scopeId) uniqueness constraint. */
  findPluginInstallation(
    pluginId: string,
    scopeType: PluginInstallationRecord['scopeType'],
    scopeId: string,
  ): PluginInstallationRecord | undefined {
    return [...this.pluginInstallations.values()].find(
      (row) => row.pluginId === pluginId && row.scopeType === scopeType && row.scopeId === scopeId,
    );
  }

  listPluginInstallationsForScope(
    scopeType: PluginInstallationRecord['scopeType'],
    scopeId: string,
  ): PluginInstallationRecord[] {
    return [...this.pluginInstallations.values()].filter(
      (row) => row.scopeType === scopeType && row.scopeId === scopeId,
    );
  }

  listPluginInstallationsForPlugin(pluginId: string): PluginInstallationRecord[] {
    return [...this.pluginInstallations.values()].filter((row) => row.pluginId === pluginId);
  }

  updatePluginInstallation(
    id: string,
    patch: Partial<Omit<PluginInstallationRecord, 'id' | 'installedAt'>>,
  ): PluginInstallationRecord | undefined {
    const existing = this.pluginInstallations.get(id);
    if (!existing) return undefined;
    const updated: PluginInstallationRecord = { ...existing, ...patch, updatedAt: nowIso() };
    this.pluginInstallations.set(id, updated);
    return updated;
  }

  deletePluginInstallation(id: string): boolean {
    return this.pluginInstallations.delete(id);
  }

  // --- Coliseum ---

  private static coliseumVoteKey(argumentId: string, voterId: string): string {
    return `${argumentId}::${voterId}`;
  }

  listColiseumTopics(): ColiseumTopicRecord[] {
    return [...this.coliseumTopics.values()];
  }

  getColiseumTopic(id: string): ColiseumTopicRecord | undefined {
    return this.coliseumTopics.get(id);
  }

  upsertColiseumTopic(record: ColiseumTopicRecord): ColiseumTopicRecord {
    this.coliseumTopics.set(record.id, record);
    return record;
  }

  listColiseumArguments(): ColiseumArgumentRecord[] {
    return [...this.coliseumArguments.values()];
  }

  getColiseumArgument(id: string): ColiseumArgumentRecord | undefined {
    return this.coliseumArguments.get(id);
  }

  upsertColiseumArgument(record: ColiseumArgumentRecord): ColiseumArgumentRecord {
    this.coliseumArguments.set(record.id, record);
    return record;
  }

  /** Bulk upsert so a score recompute persists once rather than per-argument. */
  upsertColiseumArguments(records: readonly ColiseumArgumentRecord[]): void {
    for (const record of records) this.coliseumArguments.set(record.id, record);
  }

  listColiseumVotes(): ColiseumVoteRecord[] {
    return [...this.coliseumVotes.values()];
  }

  getColiseumVote(argumentId: string, voterId: string): ColiseumVoteRecord | undefined {
    return this.coliseumVotes.get(InMemoryDb.coliseumVoteKey(argumentId, voterId));
  }

  upsertColiseumVote(record: ColiseumVoteRecord): ColiseumVoteRecord {
    this.coliseumVotes.set(InMemoryDb.coliseumVoteKey(record.argumentId, record.voterId), record);
    return record;
  }

  listColiseumLiveSessions(): ColiseumLiveSessionRecord[] {
    return [...this.coliseumLiveSessions.values()];
  }

  getColiseumLiveSession(id: string): ColiseumLiveSessionRecord | undefined {
    return this.coliseumLiveSessions.get(id);
  }

  upsertColiseumLiveSession(record: ColiseumLiveSessionRecord): ColiseumLiveSessionRecord {
    this.coliseumLiveSessions.set(record.id, record);
    return record;
  }
}

export class FileBackedDb extends InMemoryDb {
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
    this.canopyDirectoryEntries = new Map(
      (parsed.canopyDirectoryEntries ?? []).map((row) => [row.canopyId, row]),
    );
    this.messages = new Map(parsed.messages.map((row) => [row.id, row]));
    this.scheduledMessages = new Map(
      (parsed.scheduledMessages ?? []).map((row) => [row.id, row]),
    );
    this.votes = new Map(parsed.votes.map((row) => [row.id, row]));
    this.voteEntries = new Map(parsed.voteEntries.map((row) => [row.id, row]));
    this.federationLinks = new Map(parsed.federationLinks.map((row) => [row.id, row]));
    this.forumPosts = new Map((parsed.forumPosts ?? []).map((row) => [row.id, row]));
    this.deadDrops = new Map((parsed.deadDrops ?? []).map((row) => [row.id, row]));
    this.deadmanSwitches = new Map(
      (parsed.deadmanSwitches ?? []).map((row) => [row.id, row])
    );
    this.moderationActions = new Map((parsed.moderationActions ?? []).map((row) => [row.id, row]));
    this.creatorStreamAuth = new Map((parsed.creatorStreamAuth ?? []).map((row) => [row.id, row]));
    this.streams = new Map((parsed.streams ?? []).map((row) => [row.id, row]));
    this.streamSessions = new Map((parsed.streamSessions ?? []).map((row) => [row.id, row]));
    this.streamModeration = new Map((parsed.streamModeration ?? []).map((row) => [row.streamId, row]));
    this.clips = new Map((parsed.clips ?? []).map((row) => [row.id, row]));
    this.canopyVoiceRooms = new Map((parsed.canopyVoiceRooms ?? []).map((row) => [row.id, row]));
    this.voiceRoomParticipants = new Map((parsed.voiceRoomParticipants ?? []).map((row) => [row.id, row]));
    this.voiceRoomEvents = new Map((parsed.voiceRoomEvents ?? []).map((row) => [row.id, row]));
    this.marketplaceEntitlements = new Map(
      (parsed.marketplaceEntitlements ?? []).map((row) => [row.id, row])
    );
    this.marketplaceWebhookAudit = new Map(
      (parsed.marketplaceWebhookAudit ?? []).map((row) => [
        `${row.providerId}:${row.eventId}`,
        row,
      ])
    );
    this.marketplaceLicenseKeys = new Map(
      (parsed.marketplaceLicenseKeys ?? []).map((row) => [row.entitlementId, row])
    );
    this.marketplaceListingsCache = new Map(
      (parsed.marketplaceListingsCache ?? []).map((row) => [row.cacheKey, row])
    );
    this.tips = new Map((parsed.tips ?? []).map((row) => [row.id, row]));
    this.creatorSubscriptionTiers = new Map(
      (parsed.creatorSubscriptionTiers ?? []).map((row) => [row.id, row])
    );
    this.creatorSubscriptions = new Map(
      (parsed.creatorSubscriptions ?? []).map((row) => [row.id, row])
    );
    this.communityBoostPledges = new Map(
      (parsed.communityBoostPledges ?? []).map((row) => [row.id, row])
    );
    this.aidPools = new Map((parsed.aidPools ?? []).map((row) => [row.id, row]));
    this.adRevenuePeriods = new Map(
      (parsed.adRevenuePeriods ?? []).map((row) => [row.id, row])
    );
    this.adRevenueShares = new Map(
      (parsed.adRevenueShares ?? []).map((row) => [row.id, row])
    );
    this.passwordResetTokens = new Map(
      (parsed.passwordResetTokens ?? []).map((row) => [row.id, row])
    );
    this.emailVerificationTokens = new Map(
      (parsed.emailVerificationTokens ?? []).map((row) => [row.id, row])
    );
    this.accountDeletionTokens = new Map(
      (parsed.accountDeletionTokens ?? []).map((row) => [row.id, row])
    );
    this.invitationTokens = new Map(
      (parsed.invitationTokens ?? []).map((row) => [row.id, row])
    );
    this.invitationRedemptions = new Map(
      (parsed.invitationRedemptions ?? []).map((row) => [row.id, row])
    );
    this.refreshTokens = new Map((parsed.refreshTokens ?? []).map((row) => [row.id, row]));
    this.revokedSessions = new Map(
      (parsed.revokedSessions ?? []).map((row) => [row.jti, row])
    );
    this.linkedAccounts = new Map(
      (parsed.linkedAccounts ?? []).map((row) => [`${row.blackoutUserId}:${row.provider}`, row]),
    );
    this.pendingOAuthLinks = new Map(
      (parsed.pendingOAuthLinks ?? []).map((row) => [row.stateHash, row]),
    );
    this.twitchChatBridges = new Map(
      (parsed.twitchChatBridges ?? []).map((row) => [row.id, row]),
    );
    this.twitchEventSubscriptions = new Map(
      (parsed.twitchEventSubscriptions ?? []).map((row) => [row.helixSubscriptionId, row]),
    );
    this.widgetAlertTokens = new Map(
      (parsed.widgetAlertTokens ?? []).map((row) => [row.secretHash, row]),
    );
    this.youtubeChatBridges = new Map(
      (parsed.youtubeChatBridges ?? []).map((row) => [row.id, row]),
    );
    this.kickChatBridges = new Map(
      (parsed.kickChatBridges ?? []).map((row) => [row.id, row]),
    );
    this.simulcastDestinations = new Map(
      (parsed.simulcastDestinations ?? []).map((row) => [row.id, row]),
    );
    this.discordCompatWebhooks = new Map(
      (parsed.discordCompatWebhooks ?? []).map((row) => [row.id, row]),
    );
    this.outboundEventWebhooks = new Map(
      (parsed.outboundEventWebhooks ?? []).map((row) => [row.id, row]),
    );
    this.twitchIrcBotTokens = new Map(
      (parsed.twitchIrcBotTokens ?? []).map((row) => [row.id, row]),
    );
    this.obsWsPasswords = new Map(
      (parsed.obsWsPasswords ?? []).map((row) => [row.id, row]),
    );
    if (parsed.coalitionSpatialItems) {
      this.coalitionSpatialItems = new Map(
        parsed.coalitionSpatialItems.map((row) => [row.id, row]),
      );
    }
    if (parsed.coalitionAidPosts) {
      this.coalitionAidPosts = new Map(
        parsed.coalitionAidPosts.map((row) => [row.id, row]),
      );
    }
    this.pluginInstallations = new Map(
      (parsed.pluginInstallations ?? []).map((row) => [row.id, row]),
    );
    if (parsed.coliseumTopics) {
      this.coliseumTopics = new Map(parsed.coliseumTopics.map((row) => [row.id, row]));
    }
    if (parsed.coliseumArguments) {
      this.coliseumArguments = new Map(parsed.coliseumArguments.map((row) => [row.id, row]));
    }
    if (parsed.coliseumVotes) {
      this.coliseumVotes = new Map(
        parsed.coliseumVotes.map((row) => [`${row.argumentId}::${row.voterId}`, row]),
      );
    }
    if (parsed.coliseumLiveSessions) {
      this.coliseumLiveSessions = new Map(
        parsed.coliseumLiveSessions.map((row) => [row.id, row]),
      );
    }
  }

  private snapshot(): PersistedState {
    return {
      users: [...this.users.values()],
      canopyDirectoryEntries: [...this.canopyDirectoryEntries.values()],
      messages: [...this.messages.values()],
      scheduledMessages: [...this.scheduledMessages.values()],
      votes: [...this.votes.values()],
      voteEntries: [...this.voteEntries.values()],
      federationLinks: [...this.federationLinks.values()],
      forumPosts: [...this.forumPosts.values()],
      deadDrops: [...this.deadDrops.values()],
      deadmanSwitches: [...this.deadmanSwitches.values()],
      moderationActions: [...this.moderationActions.values()],
      creatorStreamAuth: [...this.creatorStreamAuth.values()],
      streams: [...this.streams.values()],
      streamSessions: [...this.streamSessions.values()],
      streamModeration: [...this.streamModeration.values()],
      clips: [...this.clips.values()],
      canopyVoiceRooms: [...this.canopyVoiceRooms.values()],
      voiceRoomParticipants: [...this.voiceRoomParticipants.values()],
      voiceRoomEvents: [...this.voiceRoomEvents.values()],
      marketplaceEntitlements: [...this.marketplaceEntitlements.values()],
      marketplaceWebhookAudit: [...this.marketplaceWebhookAudit.values()],
      marketplaceLicenseKeys: [...this.marketplaceLicenseKeys.values()],
      marketplaceListingsCache: [...this.marketplaceListingsCache.values()],
      tips: [...this.tips.values()],
      creatorSubscriptionTiers: [...this.creatorSubscriptionTiers.values()],
      creatorSubscriptions: [...this.creatorSubscriptions.values()],
      communityBoostPledges: [...this.communityBoostPledges.values()],
      aidPools: [...this.aidPools.values()],
      adRevenuePeriods: [...this.adRevenuePeriods.values()],
      adRevenueShares: [...this.adRevenueShares.values()],
      passwordResetTokens: [...this.passwordResetTokens.values()],
      emailVerificationTokens: [...this.emailVerificationTokens.values()],
      accountDeletionTokens: [...this.accountDeletionTokens.values()],
      invitationTokens: [...this.invitationTokens.values()],
      invitationRedemptions: [...this.invitationRedemptions.values()],
      refreshTokens: [...this.refreshTokens.values()],
      revokedSessions: [...this.revokedSessions.values()],
      linkedAccounts: [...this.linkedAccounts.values()],
      pendingOAuthLinks: [...this.pendingOAuthLinks.values()],
      twitchChatBridges: [...this.twitchChatBridges.values()],
      twitchEventSubscriptions: [...this.twitchEventSubscriptions.values()],
      widgetAlertTokens: [...this.widgetAlertTokens.values()],
      youtubeChatBridges: [...this.youtubeChatBridges.values()],
      kickChatBridges: [...this.kickChatBridges.values()],
      simulcastDestinations: [...this.simulcastDestinations.values()],
      discordCompatWebhooks: [...this.discordCompatWebhooks.values()],
      outboundEventWebhooks: [...this.outboundEventWebhooks.values()],
      twitchIrcBotTokens: [...this.twitchIrcBotTokens.values()],
      obsWsPasswords: [...this.obsWsPasswords.values()],
      coalitionSpatialItems: [...this.coalitionSpatialItems.values()],
      coalitionAidPosts: [...this.coalitionAidPosts.values()],
      pluginInstallations: [...this.pluginInstallations.values()],
      coliseumTopics: [...this.coliseumTopics.values()],
      coliseumArguments: [...this.coliseumArguments.values()],
      coliseumVotes: [...this.coliseumVotes.values()],
      coliseumLiveSessions: [...this.coliseumLiveSessions.values()],
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

  override createScheduledMessage(
    input: Omit<ScheduledMessageRecord, 'createdAt' | 'status' | 'attempts' | 'deliveredAt' | 'lastError'>,
  ): ScheduledMessageRecord {
    const created = super.createScheduledMessage(input);
    this.persist();
    return created;
  }

  override markScheduledMessageDelivered(id: string): ScheduledMessageRecord | undefined {
    const updated = super.markScheduledMessageDelivered(id);
    if (updated) this.persist();
    return updated;
  }

  override markScheduledMessageFailed(
    id: string,
    error: string,
    options: { terminal?: boolean } = {},
  ): ScheduledMessageRecord | undefined {
    const updated = super.markScheduledMessageFailed(id, error, options);
    if (updated) this.persist();
    return updated;
  }

  override cancelScheduledMessage(id: string, userId: string): ScheduledMessageRecord | undefined {
    const updated = super.cancelScheduledMessage(id, userId);
    if (updated) this.persist();
    return updated;
  }

  override deleteUser(id: string): boolean {
    const removed = super.deleteUser(id);
    if (removed) this.persist();
    return removed;
  }

  override updateUserPassword(id: string, passwordHash: string): UserRecord | undefined {
    const updated = super.updateUserPassword(id, passwordHash);
    if (updated) this.persist();
    return updated;
  }

  override createPasswordResetToken(
    input: Omit<PasswordResetTokenRecord, 'createdAt'>,
  ): PasswordResetTokenRecord {
    const record = super.createPasswordResetToken(input);
    this.persist();
    return record;
  }

  override consumePasswordResetToken(id: string): PasswordResetTokenRecord | undefined {
    const updated = super.consumePasswordResetToken(id);
    if (updated) this.persist();
    return updated;
  }

  override createEmailVerificationToken(
    input: Omit<EmailVerificationTokenRecord, 'createdAt'>,
  ): EmailVerificationTokenRecord {
    const record = super.createEmailVerificationToken(input);
    this.persist();
    return record;
  }

  override consumeEmailVerificationToken(id: string): EmailVerificationTokenRecord | undefined {
    const updated = super.consumeEmailVerificationToken(id);
    if (updated) this.persist();
    return updated;
  }

  override markUserEmailVerified(id: string, at?: string): UserRecord | undefined {
    const updated = super.markUserEmailVerified(id, at);
    if (updated) this.persist();
    return updated;
  }

  override createAccountDeletionToken(
    input: Omit<AccountDeletionTokenRecord, 'createdAt'>,
  ): AccountDeletionTokenRecord {
    const record = super.createAccountDeletionToken(input);
    this.persist();
    return record;
  }

  override consumeAccountDeletionToken(id: string): AccountDeletionTokenRecord | undefined {
    const updated = super.consumeAccountDeletionToken(id);
    if (updated) this.persist();
    return updated;
  }

  override createInvitationToken(
    input: Omit<InvitationTokenRecord, 'createdAt' | 'useCount'> & { useCount?: number },
  ): InvitationTokenRecord {
    const record = super.createInvitationToken(input);
    this.persist();
    return record;
  }

  override incrementInvitationTokenUseCount(id: string): InvitationTokenRecord | undefined {
    const updated = super.incrementInvitationTokenUseCount(id);
    if (updated) this.persist();
    return updated;
  }

  override revokeInvitationToken(id: string, reason: string): InvitationTokenRecord | undefined {
    const updated = super.revokeInvitationToken(id, reason);
    if (updated) this.persist();
    return updated;
  }

  override createInvitationRedemption(
    input: Omit<InvitationRedemptionRecord, 'createdAt'>,
  ): InvitationRedemptionRecord {
    const record = super.createInvitationRedemption(input);
    this.persist();
    return record;
  }

  override purgeUserAuthArtifacts(userId: string): void {
    super.purgeUserAuthArtifacts(userId);
    this.persist();
  }

  override createRefreshToken(
    input: Omit<RefreshTokenRecord, 'createdAt'>,
  ): RefreshTokenRecord {
    const record = super.createRefreshToken(input);
    this.persist();
    return record;
  }

  override markRefreshTokenReplaced(id: string, replacedBy: string): RefreshTokenRecord | undefined {
    const updated = super.markRefreshTokenReplaced(id, replacedBy);
    if (updated) this.persist();
    return updated;
  }

  override revokeRefreshTokenFamily(familyId: string, reason: string): number {
    const count = super.revokeRefreshTokenFamily(familyId, reason);
    if (count > 0) this.persist();
    return count;
  }

  override revokeRefreshTokensForUser(userId: string, reason: string): number {
    const count = super.revokeRefreshTokensForUser(userId, reason);
    if (count > 0) this.persist();
    return count;
  }

  override revokeSession(input: Omit<RevokedSessionRecord, 'revokedAt'>): RevokedSessionRecord {
    const record = super.revokeSession(input);
    this.persist();
    return record;
  }

  override upsertCanopyDirectoryEntry(
    input: Omit<CanopyDirectoryEntryRecord, 'indexedAt'>,
  ): CanopyDirectoryEntryRecord {
    const record = super.upsertCanopyDirectoryEntry(input);
    this.persist();
    return record;
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

  override createDeadmanSwitch(
    input: Omit<DeadmanSwitchRecord, 'createdAt' | 'updatedAt'>
  ): DeadmanSwitchRecord {
    const created = super.createDeadmanSwitch(input);
    this.persist();
    return created;
  }

  override updateDeadmanSwitch(
    id: string,
    patch: Partial<Omit<DeadmanSwitchRecord, 'id' | 'createdAt'>>
  ): DeadmanSwitchRecord | undefined {
    const updated = super.updateDeadmanSwitch(id, patch);
    if (updated) this.persist();
    return updated;
  }

  override createModerationAction(input: Omit<ModerationActionRecord, 'createdAt'>): ModerationActionRecord {
    const created = super.createModerationAction(input);
    this.persist();
    return created;
  }

  override upsertCreatorStreamAuth(input: Omit<CreatorStreamAuthRecord, 'createdAt' | 'rotatedAt'>): CreatorStreamAuthRecord {
    const created = super.upsertCreatorStreamAuth(input);
    this.persist();
    return created;
  }

  override upsertStream(input: Omit<StreamRecord, 'createdAt' | 'updatedAt'>): StreamRecord {
    const created = super.upsertStream(input);
    this.persist();
    return created;
  }

  override createStreamSession(input: Omit<StreamSessionRecord, 'createdAt'>): StreamSessionRecord {
    const created = super.createStreamSession(input);
    this.persist();
    return created;
  }

  override endStreamSession(sessionId: string, replayPointer?: string): StreamSessionRecord | undefined {
    const ended = super.endStreamSession(sessionId, replayPointer);
    if (ended) this.persist();
    return ended;
  }

  override upsertStreamModeration(input: Omit<StreamModerationRecord, 'updatedAt'>): StreamModerationRecord {
    const created = super.upsertStreamModeration(input);
    this.persist();
    return created;
  }

  override upsertClip(input: Omit<ClipRecord, 'createdAt' | 'updatedAt'>): ClipRecord {
    const created = super.upsertClip(input);
    this.persist();
    return created;
  }

  override deleteClip(clipId: string): boolean {
    const deleted = super.deleteClip(clipId);
    if (deleted) this.persist();
    return deleted;
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

  override upsertMarketplaceEntitlement(
    record: MarketplaceEntitlementRecord
  ): MarketplaceEntitlementRecord {
    const created = super.upsertMarketplaceEntitlement(record);
    this.persist();
    return created;
  }

  override recordMarketplaceWebhook(
    record: MarketplaceWebhookAuditRecord
  ): MarketplaceWebhookAuditRecord {
    const created = super.recordMarketplaceWebhook(record);
    this.persist();
    return created;
  }

  override markMarketplaceWebhookProcessed(
    providerId: MarketplaceProviderIdString,
    eventId: string,
    processedAt: string
  ): MarketplaceWebhookAuditRecord | undefined {
    const updated = super.markMarketplaceWebhookProcessed(providerId, eventId, processedAt);
    if (updated) this.persist();
    return updated;
  }

  override upsertMarketplaceLicenseKey(
    record: MarketplaceLicenseKeyRecord
  ): MarketplaceLicenseKeyRecord {
    const created = super.upsertMarketplaceLicenseKey(record);
    this.persist();
    return created;
  }

  override upsertMarketplaceListingsCache(
    record: MarketplaceListingsCacheRecord
  ): MarketplaceListingsCacheRecord {
    const created = super.upsertMarketplaceListingsCache(record);
    this.persist();
    return created;
  }

  override resetMarketplaceForTest(): void {
    super.resetMarketplaceForTest();
    this.persist();
  }

  override insertTip(record: TipRecord): TipRecord {
    const created = super.insertTip(record);
    this.persist();
    return created;
  }

  override updateTip(record: TipRecord): TipRecord {
    const updated = super.updateTip(record);
    this.persist();
    return updated;
  }

  override resetTipsForTest(): void {
    super.resetTipsForTest();
    this.persist();
  }

  override insertCreatorSubscriptionTier(
    record: CreatorSubscriptionTierRecord
  ): CreatorSubscriptionTierRecord {
    const created = super.insertCreatorSubscriptionTier(record);
    this.persist();
    return created;
  }

  override updateCreatorSubscriptionTier(
    record: CreatorSubscriptionTierRecord
  ): CreatorSubscriptionTierRecord {
    const updated = super.updateCreatorSubscriptionTier(record);
    this.persist();
    return updated;
  }

  override insertCreatorSubscription(
    record: CreatorSubscriptionRecord
  ): CreatorSubscriptionRecord {
    const created = super.insertCreatorSubscription(record);
    this.persist();
    return created;
  }

  override updateCreatorSubscription(
    record: CreatorSubscriptionRecord
  ): CreatorSubscriptionRecord {
    const updated = super.updateCreatorSubscription(record);
    this.persist();
    return updated;
  }

  override resetCreatorSubscriptionsForTest(): void {
    super.resetCreatorSubscriptionsForTest();
    this.persist();
  }

  override insertCommunityBoostPledge(
    record: CommunityBoostPledgeRecord
  ): CommunityBoostPledgeRecord {
    const created = super.insertCommunityBoostPledge(record);
    this.persist();
    return created;
  }

  override updateCommunityBoostPledge(
    record: CommunityBoostPledgeRecord
  ): CommunityBoostPledgeRecord {
    const updated = super.updateCommunityBoostPledge(record);
    this.persist();
    return updated;
  }

  override resetCommunityBoostsForTest(): void {
    super.resetCommunityBoostsForTest();
    this.persist();
  }

  override insertAidPool(record: AidPoolRecord): AidPoolRecord {
    const created = super.insertAidPool(record);
    this.persist();
    return created;
  }

  override updateAidPool(record: AidPoolRecord): AidPoolRecord {
    const updated = super.updateAidPool(record);
    this.persist();
    return updated;
  }

  override resetAidPoolsForTest(): void {
    super.resetAidPoolsForTest();
    this.persist();
  }

  override insertAdRevenuePeriod(record: AdRevenuePeriodRecord): AdRevenuePeriodRecord {
    const created = super.insertAdRevenuePeriod(record);
    this.persist();
    return created;
  }

  override updateAdRevenuePeriod(record: AdRevenuePeriodRecord): AdRevenuePeriodRecord {
    const updated = super.updateAdRevenuePeriod(record);
    this.persist();
    return updated;
  }

  override insertAdRevenueShare(record: AdRevenueShareRecord): AdRevenueShareRecord {
    const created = super.insertAdRevenueShare(record);
    this.persist();
    return created;
  }

  override updateAdRevenueShare(record: AdRevenueShareRecord): AdRevenueShareRecord {
    const updated = super.updateAdRevenueShare(record);
    this.persist();
    return updated;
  }

  override resetAdRevenueForTest(): void {
    super.resetAdRevenueForTest();
    this.persist();
  }

  override upsertLinkedAccount(
    input: Omit<LinkedAccountRecord, 'createdAt' | 'updatedAt'>,
  ): LinkedAccountRecord {
    const record = super.upsertLinkedAccount(input);
    this.persist();
    return record;
  }

  override deleteLinkedAccount(userId: string, provider: LinkedAccountProvider): boolean {
    const removed = super.deleteLinkedAccount(userId, provider);
    if (removed) this.persist();
    return removed;
  }

  override setLinkedAccountSyncCursor(
    userId: string,
    provider: LinkedAccountProvider,
    cursor: string | undefined,
  ): LinkedAccountRecord | undefined {
    const updated = super.setLinkedAccountSyncCursor(userId, provider, cursor);
    if (updated) this.persist();
    return updated;
  }

  override createPendingOAuthLink(
    input: Omit<PendingOAuthLinkRecord, 'createdAt'>,
  ): PendingOAuthLinkRecord {
    const record = super.createPendingOAuthLink(input);
    this.persist();
    return record;
  }

  override consumePendingOAuthLink(stateHash: string): PendingOAuthLinkRecord | undefined {
    const consumed = super.consumePendingOAuthLink(stateHash);
    if (consumed) this.persist();
    return consumed;
  }

  override prunePendingOAuthLinks(now: Date = new Date()): number {
    const removed = super.prunePendingOAuthLinks(now);
    if (removed > 0) this.persist();
    return removed;
  }

  override createTwitchChatBridge(
    input: Omit<TwitchChatBridgeRecord, 'createdAt' | 'updatedAt'>,
  ): TwitchChatBridgeRecord {
    const record = super.createTwitchChatBridge(input);
    this.persist();
    return record;
  }

  override updateTwitchChatBridge(
    id: string,
    patch: Partial<Omit<TwitchChatBridgeRecord, 'id' | 'createdAt'>>,
  ): TwitchChatBridgeRecord | undefined {
    const updated = super.updateTwitchChatBridge(id, patch);
    if (updated) this.persist();
    return updated;
  }

  override deleteTwitchChatBridge(id: string): boolean {
    const removed = super.deleteTwitchChatBridge(id);
    if (removed) this.persist();
    return removed;
  }

  override createTwitchEventSubscription(
    input: Omit<TwitchEventSubscriptionRecord, 'createdAt' | 'updatedAt'>,
  ): TwitchEventSubscriptionRecord {
    const record = super.createTwitchEventSubscription(input);
    this.persist();
    return record;
  }

  override updateTwitchEventSubscriptionStatus(
    helixId: string,
    status: string,
  ): TwitchEventSubscriptionRecord | undefined {
    const updated = super.updateTwitchEventSubscriptionStatus(helixId, status);
    if (updated) this.persist();
    return updated;
  }

  override deleteTwitchEventSubscription(helixId: string): boolean {
    const removed = super.deleteTwitchEventSubscription(helixId);
    if (removed) this.persist();
    return removed;
  }

  override createWidgetAlertToken(
    input: Omit<WidgetAlertTokenRecord, 'createdAt'>,
  ): WidgetAlertTokenRecord {
    const record = super.createWidgetAlertToken(input);
    this.persist();
    return record;
  }

  override revokeWidgetAlertToken(
    id: string,
    reason: string,
  ): WidgetAlertTokenRecord | undefined {
    const updated = super.revokeWidgetAlertToken(id, reason);
    if (updated) this.persist();
    return updated;
  }

  // No `touchWidgetAlertTokenDelivered` override — touching last-delivered on
  // every SSE flush would write the JSON store thousands of times per
  // stream. The diagnostic field is in-memory only on the file-backed db.

  override createYoutubeChatBridge(
    input: Omit<YoutubeChatBridgeRecord, 'createdAt' | 'updatedAt'>,
  ): YoutubeChatBridgeRecord {
    const record = super.createYoutubeChatBridge(input);
    this.persist();
    return record;
  }

  override updateYoutubeChatBridge(
    id: string,
    patch: Partial<Omit<YoutubeChatBridgeRecord, 'id' | 'createdAt'>>,
  ): YoutubeChatBridgeRecord | undefined {
    const updated = super.updateYoutubeChatBridge(id, patch);
    if (updated) this.persist();
    return updated;
  }

  override deleteYoutubeChatBridge(id: string): boolean {
    const removed = super.deleteYoutubeChatBridge(id);
    if (removed) this.persist();
    return removed;
  }

  override createKickChatBridge(
    input: Omit<KickChatBridgeRecord, 'createdAt' | 'updatedAt'>,
  ): KickChatBridgeRecord {
    const record = super.createKickChatBridge(input);
    this.persist();
    return record;
  }

  override updateKickChatBridge(
    id: string,
    patch: Partial<Omit<KickChatBridgeRecord, 'id' | 'createdAt'>>,
  ): KickChatBridgeRecord | undefined {
    const updated = super.updateKickChatBridge(id, patch);
    if (updated) this.persist();
    return updated;
  }

  override deleteKickChatBridge(id: string): boolean {
    const removed = super.deleteKickChatBridge(id);
    if (removed) this.persist();
    return removed;
  }

  override createSimulcastDestination(
    input: Omit<SimulcastDestinationRecord, 'createdAt' | 'updatedAt'>,
  ): SimulcastDestinationRecord {
    const record = super.createSimulcastDestination(input);
    this.persist();
    return record;
  }

  override updateSimulcastDestination(
    id: string,
    patch: Partial<Omit<SimulcastDestinationRecord, 'id' | 'createdAt'>>,
  ): SimulcastDestinationRecord | undefined {
    const updated = super.updateSimulcastDestination(id, patch);
    if (updated) this.persist();
    return updated;
  }

  override deleteSimulcastDestination(id: string): boolean {
    const removed = super.deleteSimulcastDestination(id);
    if (removed) this.persist();
    return removed;
  }

  override createDiscordCompatWebhook(
    input: Omit<DiscordCompatWebhookRecord, 'createdAt' | 'updatedAt'>,
  ): DiscordCompatWebhookRecord {
    const record = super.createDiscordCompatWebhook(input);
    this.persist();
    return record;
  }

  override updateDiscordCompatWebhook(
    id: string,
    patch: Partial<Omit<DiscordCompatWebhookRecord, 'id' | 'createdAt'>>,
  ): DiscordCompatWebhookRecord | undefined {
    const updated = super.updateDiscordCompatWebhook(id, patch);
    if (updated) this.persist();
    return updated;
  }

  override deleteDiscordCompatWebhook(id: string): boolean {
    const removed = super.deleteDiscordCompatWebhook(id);
    if (removed) this.persist();
    return removed;
  }

  override createOutboundEventWebhook(
    input: Omit<OutboundEventWebhookRecord, 'createdAt' | 'updatedAt'>,
  ): OutboundEventWebhookRecord {
    const record = super.createOutboundEventWebhook(input);
    this.persist();
    return record;
  }

  override updateOutboundEventWebhook(
    id: string,
    patch: Partial<Omit<OutboundEventWebhookRecord, 'id' | 'createdAt'>>,
  ): OutboundEventWebhookRecord | undefined {
    const updated = super.updateOutboundEventWebhook(id, patch);
    if (updated) this.persist();
    return updated;
  }

  override deleteOutboundEventWebhook(id: string): boolean {
    const removed = super.deleteOutboundEventWebhook(id);
    if (removed) this.persist();
    return removed;
  }

  override createTwitchIrcBotToken(
    input: Omit<TwitchIrcBotTokenRecord, 'createdAt' | 'updatedAt'>,
  ): TwitchIrcBotTokenRecord {
    const record = super.createTwitchIrcBotToken(input);
    this.persist();
    return record;
  }

  override revokeTwitchIrcBotToken(id: string, reason: string): TwitchIrcBotTokenRecord | undefined {
    const updated = super.revokeTwitchIrcBotToken(id, reason);
    if (updated) this.persist();
    return updated;
  }

  // No `touchTwitchIrcBotTokenUsed` override — write amplification on
  // every IRC auth would thrash the JSON store. Diagnostic field is
  // in-memory only on the file-backed db.

  override deleteTwitchIrcBotToken(id: string): boolean {
    const removed = super.deleteTwitchIrcBotToken(id);
    if (removed) this.persist();
    return removed;
  }

  override createObsWsPassword(
    input: Omit<ObsWsPasswordRecord, 'createdAt' | 'updatedAt'>,
  ): ObsWsPasswordRecord {
    const record = super.createObsWsPassword(input);
    this.persist();
    return record;
  }

  override revokeObsWsPassword(id: string, reason: string): ObsWsPasswordRecord | undefined {
    const updated = super.revokeObsWsPassword(id, reason);
    if (updated) this.persist();
    return updated;
  }

  // No `touchObsWsPasswordUsed` override — write amplification on every
  // OBS-WS connection would thrash the JSON store. In-memory only.

  override deleteObsWsPassword(id: string): boolean {
    const removed = super.deleteObsWsPassword(id);
    if (removed) this.persist();
    return removed;
  }

  override upsertCoalitionSpatialItem(
    input: Omit<CoalitionSpatialItemRecord, 'createdAt' | 'updatedAt'>,
  ): CoalitionSpatialItemRecord {
    const created = super.upsertCoalitionSpatialItem(input);
    this.persist();
    return created;
  }

  override createCoalitionAidPost(
    input: Omit<CoalitionAidPostRecord, 'createdAt'>,
  ): CoalitionAidPostRecord {
    const created = super.createCoalitionAidPost(input);
    this.persist();
    return created;
  }

  override createPluginInstallation(
    input: Omit<PluginInstallationRecord, 'installedAt' | 'updatedAt'>,
  ): PluginInstallationRecord {
    const created = super.createPluginInstallation(input);
    this.persist();
    return created;
  }

  override updatePluginInstallation(
    id: string,
    patch: Partial<Omit<PluginInstallationRecord, 'id' | 'installedAt'>>,
  ): PluginInstallationRecord | undefined {
    const updated = super.updatePluginInstallation(id, patch);
    if (updated) this.persist();
    return updated;
  }

  override deletePluginInstallation(id: string): boolean {
    const removed = super.deletePluginInstallation(id);
    if (removed) this.persist();
    return removed;
  }

  override upsertColiseumTopic(record: ColiseumTopicRecord): ColiseumTopicRecord {
    const saved = super.upsertColiseumTopic(record);
    this.persist();
    return saved;
  }

  override upsertColiseumArgument(record: ColiseumArgumentRecord): ColiseumArgumentRecord {
    const saved = super.upsertColiseumArgument(record);
    this.persist();
    return saved;
  }

  override upsertColiseumArguments(records: readonly ColiseumArgumentRecord[]): void {
    super.upsertColiseumArguments(records);
    this.persist();
  }

  override upsertColiseumVote(record: ColiseumVoteRecord): ColiseumVoteRecord {
    const saved = super.upsertColiseumVote(record);
    this.persist();
    return saved;
  }

  override upsertColiseumLiveSession(
    record: ColiseumLiveSessionRecord,
  ): ColiseumLiveSessionRecord {
    const saved = super.upsertColiseumLiveSession(record);
    this.persist();
    return saved;
  }
}

/**
 * Postgres-backed store (BLACKOUT_DB_MODE=postgres). Single-instance
 * write-through: reads are inherited from InMemoryDb (served from the in-memory
 * mirror hydrated on boot), and the 107 mutators are wrapped to enqueue a
 * Postgres write after updating the mirror. Not safe for >1 replica — each
 * process holds its own mirror with no cross-instance invalidation.
 */
type MutableMap = Map<string, Record<string, unknown>>;

export class PostgresBackedDb extends InMemoryDb {
  private readonly plans = new Map<string, TablePlan>();
  private queue: WriteBehindQueue | null = null;

  constructor() {
    super();
    this.installWriteThrough();
  }

  private mapByName(name: string): MutableMap {
    return (this as unknown as Record<string, MutableMap>)[name];
  }

  /** Shadow each mutator with a wrapper that calls the original then enqueues a write. */
  private installWriteThrough(): void {
    const proto = InMemoryDb.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const self = this as unknown as Record<string, unknown>;
    for (const [method, spec] of Object.entries(MUTATOR_SPECS)) {
      const original = proto[method];
      if (typeof original !== 'function') continue;
      self[method] = (...args: unknown[]): unknown => {
        const result = original.apply(this, args);
        const queue = this.queue;
        if (queue) {
          if (spec.kind === 'upsert') {
            if (result && typeof result === 'object') {
              queue.enqueueUpsert(spec.map, result as Record<string, unknown>);
            }
          } else {
            for (const m of spec.maps) queue.enqueueResync(m);
          }
        }
        return result;
      };
    }
  }

  /** Hydrate every mapped table from Postgres, then arm the write-behind queue. */
  async init(pool: PgPool): Promise<void> {
    const client = await pool.connect();
    try {
      for (const descriptor of TABLE_DESCRIPTORS) {
        const columns = await introspectColumns(client, descriptor.tableName);
        if (columns.length === 0) {
          log.warn('pg_store_table_missing', { table: descriptor.tableName });
          continue;
        }
        const plan: TablePlan = {
          descriptor,
          columns,
          columnNames: new Set(columns.map((c) => c.name)),
        };
        this.plans.set(descriptor.mapName, plan);
        await hydrateMap(client, plan, this.mapByName(descriptor.mapName));
      }
    } finally {
      client.release?.();
    }
    this.queue = new WriteBehindQueue(pool, this.plans, (name) => this.mapByName(name));
  }

  /** Flush queued writes — call on graceful shutdown. */
  async drain(): Promise<void> {
    await this.queue?.drain();
  }
}

export const db =
  DB_MODE === 'memory'
    ? new InMemoryDb()
    : DB_MODE === 'postgres'
      ? new PostgresBackedDb()
      : new FileBackedDb();

/** Hydrate + arm the Postgres store (no-op unless BLACKOUT_DB_MODE=postgres). */
export async function initRuntimeStore(pool: PgPool): Promise<void> {
  if (db instanceof PostgresBackedDb) await db.init(pool);
}

/** Drain pending Postgres write-behind ops on graceful shutdown. */
export async function drainRuntimeStore(): Promise<void> {
  if (db instanceof PostgresBackedDb) await db.drain();
}

/** Runtime store mode, for boot wiring. */
export const RUNTIME_DB_MODE = DB_MODE;
