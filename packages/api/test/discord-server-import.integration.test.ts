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
  const secretBox = await import('../src/services/secretBox');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const importSvc = await import('../src/services/discordServerImport');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  return { linkedAccounts, importSvc, db: store.db };
};

type Mods = Awaited<ReturnType<typeof loadModules>>;

const seedUserWithDiscord = async (
  mods: Mods,
  scopes: string[] = ['identify', 'guilds'],
): Promise<string> => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  mods.db.createUser({
    id,
    username: `user-${id.slice(0, 4)}`,
    email: `user-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  mods.linkedAccounts.upsertLinkedAccount({
    blackoutUserId: id,
    provider: 'discord',
    providerUserId: 'discord-user-1',
    providerUsername: 'owner',
    tokens: { accessToken: 'user-access-token', refreshToken: 'rt', scopes },
  });
  return id;
};

// A fetch double that answers the three Discord endpoints from a fixture.
const makeDiscordFetch = (fixture: {
  guilds: unknown[];
  channels?: unknown[];
  roles?: unknown[];
  channelsStatus?: number;
}): typeof fetch =>
  (async (input: Request | string | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/users/@me/guilds')) {
      return new Response(JSON.stringify(fixture.guilds), { status: 200 });
    }
    if (url.includes('/channels')) {
      return new Response(JSON.stringify(fixture.channels ?? []), {
        status: fixture.channelsStatus ?? 200,
      });
    }
    if (url.includes('/roles')) {
      return new Response(JSON.stringify(fixture.roles ?? []), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;

const fakeMatrix = () => {
  let n = 0;
  const created: Array<{ name?: string; isSpace: boolean }> = [];
  return {
    created,
    client: {
      async createRoom(input: {
        name?: string;
        creationContent?: Record<string, unknown>;
      }) {
        n += 1;
        created.push({ name: input.name, isSpace: input.creationContent?.type === 'm.space' });
        return { ok: true as const, roomId: `!room${n}:test` };
      },
    },
  };
};

const GUILD_FULL = {
  id: 'guild-1',
  name: 'My Server',
  owner: true,
  permissions: '8', // ADMINISTRATOR
  approximate_member_count: 5000,
};

test('startImport: not_linked when the user has no Discord link', async () => {
  const mods = await loadModules();
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  mods.db.createUser({
    id,
    username: `u-${id.slice(0, 4)}`,
    email: `u-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  const out = await mods.importSvc.startImport(id, 'guild-1', {
    fetch: makeDiscordFetch({ guilds: [] }),
  });
  assert.equal(out.kind, 'not_linked');
});

test('startImport: degraded preview when no bot token is configured', async () => {
  delete process.env.MIGRATION_DISCORD_BOT_TOKEN;
  const mods = await loadModules();
  const userId = await seedUserWithDiscord(mods);
  const out = await mods.importSvc.startImport(userId, 'guild-1', {
    fetch: makeDiscordFetch({ guilds: [GUILD_FULL] }),
  });
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.equal(out.record.mode, 'preview');
  assert.equal(out.record.degraded, true);
  assert.equal(out.snapshot.reason, 'no_bot_token');
  assert.equal(out.snapshot.channels.length, 0);
});

test('startImport: not_manageable for a guild the user cannot manage', async () => {
  const mods = await loadModules();
  const userId = await seedUserWithDiscord(mods);
  const out = await mods.importSvc.startImport(userId, 'guild-9', {
    fetch: makeDiscordFetch({
      guilds: [{ id: 'guild-9', name: 'Someone Elses', owner: false, permissions: '0' }],
    }),
  });
  assert.equal(out.kind, 'not_manageable');
});

test('full import maps guild→space, channels→dens, roles→role-intents and is idempotent', async () => {
  process.env.MIGRATION_DISCORD_BOT_TOKEN = 'bot-token';
  const mods = await loadModules();
  const userId = await seedUserWithDiscord(mods);
  const discordFetch = makeDiscordFetch({
    guilds: [GUILD_FULL],
    channels: [
      { id: 'cat-1', name: 'TEXT', type: 4, position: 0 },
      { id: 'ch-1', name: 'general', type: 0, parent_id: 'cat-1', position: 1 },
      { id: 'ch-2', name: 'announcements', type: 5, parent_id: 'cat-1', position: 2 },
      { id: 'vc-1', name: 'Voice', type: 2, position: 3 }, // skipped (voice)
    ],
    roles: [
      { id: 'role-everyone', name: '@everyone', permissions: '0', position: 0 },
      { id: 'role-admin', name: 'Admin', permissions: '8', position: 2 },
      { id: 'role-mod', name: 'Mod', permissions: '8192', position: 1 }, // MANAGE_MESSAGES → 25
    ],
  });

  const start = await mods.importSvc.startImport(userId, 'guild-1', { fetch: discordFetch });
  assert.equal(start.kind, 'ok');
  if (start.kind !== 'ok') return;
  assert.equal(start.record.mode, 'full');
  assert.equal(start.snapshot.channels.length, 2); // text + announcement, not voice/category
  const importId = start.record.id;

  const matrix = fakeMatrix();
  const apply = await mods.importSvc.applyImport(userId, importId, {
    fetch: discordFetch,
    matrixClient: matrix.client,
  });
  assert.equal(apply.kind, 'ok');
  if (apply.kind !== 'ok') return;
  assert.equal(apply.summary.densCreated, 2);
  assert.equal(apply.summary.rolesMapped, 2); // admin + mod, not @everyone
  assert.equal(apply.record.status, 'applied');

  // 1 space + 2 dens were created in Matrix.
  assert.equal(matrix.created.filter((r) => r.isSpace).length, 1);
  assert.equal(matrix.created.filter((r) => !r.isSpace).length, 2);

  // role power levels were derived from Discord perms.
  const mappings = mods.db.listDiscordImportMappings(importId);
  const adminRole = mappings.find((m) => m.discordObjectId === 'role-admin');
  const modRole = mappings.find((m) => m.discordObjectId === 'role-mod');
  assert.equal(adminRole?.powerLevel, 100);
  assert.equal(modRole?.powerLevel, 25);

  // Re-applying creates nothing new (idempotent).
  const matrix2 = fakeMatrix();
  const apply2 = await mods.importSvc.applyImport(userId, importId, {
    fetch: discordFetch,
    matrixClient: matrix2.client,
  });
  assert.equal(apply2.kind, 'ok');
  if (apply2.kind !== 'ok') return;
  assert.equal(apply2.summary.densCreated, 0);
  assert.equal(apply2.summary.rolesMapped, 0);
  assert.equal(matrix2.created.length, 0);
  assert.equal(mods.db.listDiscordImportMappings(importId).length, mappings.length);
});

test('applyImport: forbidden when another user owns the import', async () => {
  process.env.MIGRATION_DISCORD_BOT_TOKEN = 'bot-token';
  const mods = await loadModules();
  const owner = await seedUserWithDiscord(mods);
  const other = await seedUserWithDiscord(mods);
  const discordFetch = makeDiscordFetch({ guilds: [GUILD_FULL], channels: [], roles: [] });
  const start = await mods.importSvc.startImport(owner, 'guild-1', { fetch: discordFetch });
  assert.equal(start.kind, 'ok');
  if (start.kind !== 'ok') return;
  const out = await mods.importSvc.applyImport(other, start.record.id, {
    fetch: discordFetch,
    matrixClient: fakeMatrix().client,
  });
  assert.equal(out.kind, 'forbidden');
});
