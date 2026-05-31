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

const load = async () => {
  const secretBox = await import('../src/services/secretBox');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const dashboard = await import('../src/services/migrationDashboard');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  return { linkedAccounts, dashboard, db: store.db };
};

type Mods = Awaited<ReturnType<typeof load>>;

const seedUser = async (mods: Mods, withDiscord = true): Promise<string> => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  mods.db.createUser({
    id,
    username: `u-${id.slice(0, 6)}`,
    email: `u-${id.slice(0, 6)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  if (withDiscord) {
    mods.linkedAccounts.upsertLinkedAccount({
      blackoutUserId: id,
      provider: 'discord',
      providerUserId: `d-${id.slice(0, 6)}`,
      tokens: { accessToken: 'tok', refreshToken: 'rt', scopes: ['identify', 'guilds'] },
    });
  }
  return id;
};

const guildsFetch = (members: number | undefined): typeof fetch =>
  (async (input: Request | string | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/users/@me/guilds')) {
      const guild: Record<string, unknown> = { id: 'guild-1', name: 'My Server', owner: true, permissions: '8' };
      if (typeof members === 'number') guild.approximate_member_count = members;
      return new Response(JSON.stringify([guild]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as unknown as typeof fetch;

test('buildDashboard: not_linked without a Discord link', async () => {
  const mods = await load();
  const userId = await seedUser(mods, false);
  const out = await mods.dashboard.buildDashboard(userId, 'guild-1', { fetch: guildsFetch(100) });
  assert.equal(out.kind, 'not_linked');
});

test('buildDashboard: reports discord members + platform totals + import/bridge counts', async () => {
  const mods = await load();
  const userId = await seedUser(mods);

  // Seed an import with one den mapping + an active bridge for the guild.
  const imp = mods.db.createDiscordServerImport({
    id: randomUUID(),
    blackoutUserId: userId,
    discordGuildId: 'guild-1',
    guildName: 'My Server',
    status: 'applied',
    mode: 'full',
    degraded: false,
  });
  mods.db.createDiscordImportMapping({
    id: randomUUID(),
    importId: imp.id,
    discordObjectType: 'channel',
    discordObjectId: 'ch-1',
    discordName: 'general',
    blackoutTargetType: 'den',
    blackoutTargetId: '!den:test',
  });
  mods.db.createDiscordBridgeActivation({
    id: randomUUID(),
    blackoutUserId: userId,
    matrixRoomId: '!den:test',
    discordGuildId: 'guild-1',
    discordChannelId: '222222222222222222',
    mode: 'two-way',
    status: 'active',
    isActive: true,
  });

  const out = await mods.dashboard.buildDashboard(userId, 'guild-1', { fetch: guildsFetch(5000) });
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  const d = out.dashboard;
  assert.equal(d.discordMembers.value, 5000);
  assert.equal(d.discordMembers.source, 'discord_guild');
  assert.equal(d.importedDens.value, 1);
  assert.equal(d.bridgedChannels.value, 1);
  assert.ok((d.blackoutAccounts.value ?? 0) >= 1);
  assert.equal(d.blackoutAccounts.source, 'platform_total');
  // Not yet measurable → explicit null + 'unavailable', never fabricated.
  assert.equal(d.activeBridgedUsers.value, null);
  assert.equal(d.activeBridgedUsers.source, 'unavailable');
  assert.equal(d.degraded, false);
});

test('buildDashboard: degraded when Discord member count is unavailable', async () => {
  const mods = await load();
  const userId = await seedUser(mods);
  const out = await mods.dashboard.buildDashboard(userId, 'guild-1', { fetch: guildsFetch(undefined) });
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.equal(out.dashboard.discordMembers.value, null);
  assert.equal(out.dashboard.degraded, true);
});
