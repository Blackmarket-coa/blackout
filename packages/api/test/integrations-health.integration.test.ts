import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

const KEY_V1 = randomBytes(32).toString('base64');

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1}`;

const loadModules = async () => {
  const health = await import('../src/services/integrationsHealth');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const secretBox = await import('../src/services/secretBox');
  const slScheduler = await import('../src/services/streamlabsDonationScheduler');
  const ytScheduler = await import('../src/services/youtubeChatBridgeScheduler');
  const chatIngress = await import('../src/integrations/twitch/chatIngress');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  slScheduler.stopStreamlabsScheduler();
  ytScheduler.stopYoutubeChatScheduler();
  chatIngress.stopAllChatIngress();
  store.db.linkedAccounts.clear();
  store.db.twitchChatBridges.clear();
  store.db.youtubeChatBridges.clear();
  store.db.twitchEventSubscriptions.clear();
  store.db.widgetAlertTokens.clear();
  // Reset the Patreon webhook env between tests so each test sets its own.
  delete process.env.PATREON_WEBHOOK_SECRET;
  return { health, linkedAccounts, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `health-${id.slice(0, 4)}`,
    email: `health-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

test('snapshot: empty creator → all collections empty, schedulers stopped, env-derived flags off', async () => {
  const { health, db } = await loadModules();
  const user = await seedUser(db);
  const snap = health.buildIntegrationsHealthSnapshot(user.id);
  assert.equal(snap.linkedAccounts.length, 0);
  assert.equal(snap.twitchChatBridges.length, 0);
  assert.equal(snap.youtubeChatBridges.length, 0);
  assert.equal(snap.twitchEventSubscriptions.length, 0);
  assert.equal(snap.widgetAlertTokens.length, 0);
  assert.equal(snap.patreon.linked, false);
  assert.equal(snap.patreon.webhookSecretConfigured, false);
  assert.equal(snap.streamlabs.linked, false);
  assert.equal(snap.streamlabs.autosyncRunning, false);
  assert.equal(snap.schedulers.youtubeChatRunning, false);
  assert.equal(snap.schedulers.streamlabsDonationsRunning, false);
});

test('snapshot: linked accounts surface expiry status; expired vs near-expiry', async () => {
  const { health, linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);
  // Twitch: expires in the future (3600s).
  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'twitch',
    providerUserId: '1',
    providerUsername: 'streamer',
    tokens: { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });
  // Discord: expired (already past). The service-level upsert won't
  // produce an expired token from a positive expiresInSeconds, so we
  // bypass it and patch the persisted row directly.
  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'discord',
    providerUserId: '2',
    providerUsername: 'd',
    tokens: { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 60, scopes: [] },
  });
  const discordRow = db.getLinkedAccount(user.id, 'discord');
  if (discordRow) {
    db.upsertLinkedAccount({
      ...discordRow,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
  }
  // YouTube: no expiry (no refresh token either).
  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'youtube',
    providerUserId: '3',
    providerUsername: 'y',
    tokens: { accessToken: 'a', scopes: [] },
  });
  const snap = health.buildIntegrationsHealthSnapshot(user.id);
  assert.equal(snap.linkedAccounts.length, 3);
  const t = snap.linkedAccounts.find((a) => a.provider === 'twitch');
  assert.equal(t?.isExpired, false);
  assert.ok((t?.expiresInSeconds ?? 0) > 3500);
  assert.equal(t?.hasRefreshToken, true);
  const d = snap.linkedAccounts.find((a) => a.provider === 'discord');
  assert.equal(d?.isExpired, true);
  const y = snap.linkedAccounts.find((a) => a.provider === 'youtube');
  assert.equal(y?.isExpired, false);
  assert.equal(y?.expiresAt, undefined);
  assert.equal(y?.hasRefreshToken, false);
});

test('snapshot: Twitch chat bridges merge persisted rows with in-process ingress state', async () => {
  const { health, db } = await loadModules();
  const user = await seedUser(db);
  const bridge = db.createTwitchChatBridge({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchChannel: 'gamer',
    matrixRoomId: '!den:srv',
    isActive: true,
  });
  const snap = health.buildIntegrationsHealthSnapshot(user.id);
  assert.equal(snap.twitchChatBridges.length, 1);
  const b = snap.twitchChatBridges[0];
  assert.equal(b.id, bridge.id);
  assert.equal(b.twitchChannel, 'gamer');
  // No in-process session running → ingressState undefined.
  assert.equal(b.ingressState, undefined);
  assert.equal(b.messagesForwarded, undefined);
});

test('snapshot: YouTube chat bridges + EventSub subs + widget tokens propagate', async () => {
  const { health, db } = await loadModules();
  const user = await seedUser(db);
  db.createYoutubeChatBridge({
    id: randomUUID(),
    blackoutUserId: user.id,
    youtubeChannelId: 'UCxxxxxxxxxxxxxxxxxxxxxx',
    matrixRoomId: '!yt:srv',
    isActive: true,
  });
  db.createTwitchEventSubscription({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchUserId: 'tw-99',
    subscriptionType: 'channel.follow',
    helixSubscriptionId: 'helix-1',
    status: 'enabled',
  });
  db.createTwitchEventSubscription({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchUserId: 'tw-99',
    subscriptionType: 'channel.subscribe',
    helixSubscriptionId: 'helix-2',
    status: 'authorization_revoked',
  });
  db.createWidgetAlertToken({
    id: randomUUID(),
    blackoutUserId: user.id,
    label: 'Main OBS',
    secretHash: 'a'.repeat(64),
    scopes: ['alerts:read'],
  });

  const snap = health.buildIntegrationsHealthSnapshot(user.id);
  assert.equal(snap.youtubeChatBridges.length, 1);
  assert.equal(snap.twitchEventSubscriptions.length, 2);
  // Subscription statuses come through verbatim so the UI can colorize
  // non-"enabled" rows.
  const revoked = snap.twitchEventSubscriptions.find((s) => s.helixSubscriptionId === 'helix-2');
  assert.equal(revoked?.status, 'authorization_revoked');
  assert.equal(snap.widgetAlertTokens.length, 1);
  assert.equal(snap.widgetAlertTokens[0].label, 'Main OBS');
});

test('snapshot: Patreon webhook flag reflects PATREON_WEBHOOK_SECRET env presence (without leaking the value)', async () => {
  const { health, db } = await loadModules();
  const user = await seedUser(db);
  // No env → flag is false.
  let snap = health.buildIntegrationsHealthSnapshot(user.id);
  assert.equal(snap.patreon.webhookSecretConfigured, false);
  // Set env → flag flips to true; the actual secret never appears in the snapshot.
  process.env.PATREON_WEBHOOK_SECRET = 'super-secret-value';
  snap = health.buildIntegrationsHealthSnapshot(user.id);
  assert.equal(snap.patreon.webhookSecretConfigured, true);
  // Defense-in-depth: serialized snapshot must not contain the secret string.
  assert.equal(JSON.stringify(snap).includes('super-secret-value'), false);
  delete process.env.PATREON_WEBHOOK_SECRET;
});

test('snapshot: Streamlabs flags reflect link presence + scheduler state + persisted cursor', async () => {
  const { health, linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);
  // Unlinked.
  let snap = health.buildIntegrationsHealthSnapshot(user.id);
  assert.equal(snap.streamlabs.linked, false);

  // Linked + cursor persisted on linked_accounts.sync_cursor.
  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'streamlabs',
    providerUserId: 'sl-1',
    providerUsername: 'creator',
    tokens: { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });
  db.setLinkedAccountSyncCursor(user.id, 'streamlabs', '12345');

  // Start the scheduler; assert flag flips.
  const slScheduler = await import('../src/services/streamlabsDonationScheduler');
  const handle = slScheduler.startStreamlabsScheduler(60_000);
  try {
    snap = health.buildIntegrationsHealthSnapshot(user.id);
    assert.equal(snap.streamlabs.linked, true);
    assert.equal(snap.streamlabs.autosyncRunning, true);
    assert.equal(snap.streamlabs.syncCursor, '12345');
    assert.equal(snap.schedulers.streamlabsDonationsRunning, true);
  } finally {
    handle.stop();
  }
});

test('snapshot: cross-user isolation — one creator\'s rows don\'t appear in another\'s snapshot', async () => {
  const { health, linkedAccounts, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: alice.id,
    provider: 'twitch',
    providerUserId: 'a-1',
    providerUsername: 'alice',
    tokens: { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });
  db.createTwitchChatBridge({
    id: randomUUID(),
    blackoutUserId: alice.id,
    twitchChannel: 'alice',
    matrixRoomId: '!a:srv',
    isActive: true,
  });
  db.createWidgetAlertToken({
    id: randomUUID(),
    blackoutUserId: alice.id,
    secretHash: 'a'.repeat(64),
    scopes: ['alerts:read'],
  });
  db.createTwitchEventSubscription({
    id: randomUUID(),
    blackoutUserId: alice.id,
    twitchUserId: 'tw-alice',
    subscriptionType: 'channel.follow',
    helixSubscriptionId: 'helix-alice',
    status: 'enabled',
  });
  const bobSnap = health.buildIntegrationsHealthSnapshot(bob.id);
  assert.equal(bobSnap.linkedAccounts.length, 0);
  assert.equal(bobSnap.twitchChatBridges.length, 0);
  assert.equal(bobSnap.widgetAlertTokens.length, 0);
  assert.equal(bobSnap.twitchEventSubscriptions.length, 0);
});
