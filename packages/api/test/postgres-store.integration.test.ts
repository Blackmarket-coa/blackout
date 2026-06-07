import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The singleton `db` in store.ts is harmless in memory mode; this suite drives
// PostgresBackedDb instances directly against an in-process PGlite database.
process.env.BLACKOUT_DB_MODE = 'memory';

const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR } = await import('../src/db/migrate');
const { TABLE_DESCRIPTORS, MUTATOR_SPECS } = await import('../src/db/pgDescriptors');
const { introspectColumns } = await import('../src/db/pgWriter');
const { PGlite } = await import('@electric-sql/pglite');

type AnyPg = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (sql: string) => Promise<unknown> };

function makePool(pg: AnyPg) {
  const client = {
    query: (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: never[] }>,
    release: () => {},
  };
  return { connect: async () => client, end: async () => {} } as never;
}

async function freshDb() {
  const pg = new PGlite() as unknown as AnyPg;
  // Apply every forward migration in ordinal order (pre-007 are NNN_name.sql,
  // 007+ are NNN_name.up.sql). Mirrors tools/ci/verify-migrations-ephemeral.mjs.
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  for (const f of files) {
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
  }
  return { pg, pool: makePool(pg) };
}

test('every descriptor maps to a real table with columns', async () => {
  const { pg, pool } = await freshDb();
  const client = await (pool as { connect: () => Promise<{ query: AnyPg['query'] }> }).connect();
  for (const d of TABLE_DESCRIPTORS) {
    const columns = await introspectColumns(client as never, d.tableName);
    assert.ok(columns.length > 0, `table ${d.tableName} (map ${d.mapName}) should exist`);
  }
  assert.equal(TABLE_DESCRIPTORS.length, 106);
  await pg.query('SELECT 1');
});

test('every mutator spec targets a real method and a real map', () => {
  const store = new PostgresBackedDb() as unknown as Record<string, unknown>;
  const mapNames = new Set(TABLE_DESCRIPTORS.map((d) => d.mapName));
  for (const [method, spec] of Object.entries(MUTATOR_SPECS)) {
    assert.equal(typeof store[method], 'function', `mutator ${method} must exist on the store`);
    if (spec.kind === 'upsert') {
      assert.ok(mapNames.has(spec.map), `spec ${method} → unknown map ${spec.map}`);
    } else {
      for (const m of spec.maps) assert.ok(mapNames.has(m), `spec ${method} → unknown map ${m}`);
    }
  }
});

test('write-through persists across a simulated restart', async () => {
  const { pool } = await freshDb();

  const store1 = new PostgresBackedDb();
  await store1.init(pool);

  const userId = randomUUID();
  store1.createUser({
    id: userId,
    username: `u_${userId.slice(0, 8)}`,
    email: `${userId.slice(0, 8)}@example.test`,
    passwordHash: 'hash',
    reputationScore: 10,
    reputationTier: 'member',
    pubkeyEd25519: 'pubkey-abc',
  });

  // TEXT-keyed new table with array columns.
  store1.upsertStream({
    id: 'stream-1',
    creatorId: 'creator-1',
    state: 'live',
    title: 'Garden build stream',
    tags: ['garden', 'build'],
    visibility: 'public',
    allowedSubscriberIds: ['sub-a', 'sub-b'],
    latencyProfile: 'low',
    denId: '!den:server',
  });

  // Non-id primary key (stream_id) + array columns.
  store1.upsertStreamModeration({
    streamId: 'stream-1',
    slowModeSeconds: 5,
    bannedUserIds: ['troll-1'],
    keywordFilters: ['spam', 'scam'],
  });

  // JSONB metadata.
  const event = store1.logVoiceRoomEvent({
    roomId: 'room-1',
    canopyId: 'canopy-1',
    channelId: 'chan-1',
    userId: 'user-x',
    eventType: 'join',
    metadata: { client: 'web', region: 'us-east' },
  });

  // Composite ON CONFLICT target (provider_id, event_id) + JSONB payload.
  store1.recordMarketplaceWebhook({
    id: randomUUID(),
    providerId: 'freeblackmarket',
    eventId: 'evt-123',
    receivedAt: new Date().toISOString(),
    processedAt: null,
    signatureOk: true,
    payload: { kind: 'purchase.succeeded', amount: 500 },
  });

  // Coalition aid post: nested location flattened to lat/lng/address columns.
  store1.createCoalitionAidPost({
    id: 'aidp-test-1',
    customerId: '@tester:server',
    type: 'need',
    category: 'food',
    title: 'Need produce boxes',
    description: 'Ten boxes for the weekend share.',
    location: { latitude: 40.7128, longitude: -74.006, address: '12 Sunrise Way' },
    displayRadiusMeters: 800,
    urgency: 'high',
    status: 'open',
    denId: '!aid:server',
  });

  // Composite-key table + a resync delete (ordering: upsert then delete).
  store1.upsertLinkedAccount({
    id: randomUUID(),
    blackoutUserId: userId,
    provider: 'twitch',
    providerUserId: 'tw-1',
    accessTokenCiphertext: 'cipher',
    scopes: ['chat:read', 'chat:edit'],
    encryptionKeyId: 'key-1',
  });
  store1.upsertLinkedAccount({
    id: randomUUID(),
    blackoutUserId: userId,
    provider: 'youtube',
    providerUserId: 'yt-1',
    accessTokenCiphertext: 'cipher2',
    scopes: ['scope'],
    encryptionKeyId: 'key-1',
  });
  // Remove the youtube link — resync must delete exactly that row.
  store1.deleteLinkedAccount(userId, 'youtube');

  // Growth ledger — TEXT (prefixed, non-UUID) ids; nullable cents; jsonb criteria.
  store1.insertReferral({
    id: 'ref-test-1',
    referrerUserId: userId,
    refereeUserId: 'referee-1',
    sourceKind: 'creator_invite',
    sourceRef: 'campaign-x',
    status: 'pending',
    rewardTipId: null,
    rewardCents: null,
    attributedAt: new Date().toISOString(),
    settledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store1.insertQuest({
    id: 'qst-test-1',
    sourceKind: 'creator',
    sourceRef: null,
    title: 'Post a build clip',
    description: 'Share a 30s build clip.',
    rewardKind: 'tip',
    rewardCents: 500,
    startsAt: null,
    endsAt: null,
    criteria: { minDurationSeconds: 30, tag: 'build' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store1.insertBountyReward({
    id: 'brw-test-1',
    bountyId: 'bounty-1',
    beneficiaryId: 'creator-9',
    posterId: userId,
    rewardType: 'store_credit',
    rewardSummary: '$5 FBM credit',
    rewardCents: 500,
    status: 'earned',
    earnedAt: new Date().toISOString(),
    settledAt: null,
    settledRef: null,
  });

  await store1.drain();

  // Simulate a restart: a brand-new store hydrating from the same database.
  const store2 = new PostgresBackedDb();
  await store2.init(pool);

  const hydratedUser = store2.getUserById(userId);
  assert.ok(hydratedUser, 'user should hydrate');
  assert.equal(hydratedUser?.username, `u_${userId.slice(0, 8)}`);

  const stream = store2.getStream('stream-1');
  assert.ok(stream, 'stream should hydrate');
  assert.deepEqual(stream?.tags, ['garden', 'build']);
  assert.deepEqual(stream?.allowedSubscriberIds, ['sub-a', 'sub-b']);
  assert.equal(stream?.denId, '!den:server');

  const mod = store2.getStreamModeration('stream-1');
  assert.equal(mod?.slowModeSeconds, 5);
  assert.deepEqual(mod?.bannedUserIds, ['troll-1']);
  assert.deepEqual(mod?.keywordFilters, ['spam', 'scam']);

  const events = store2.listVoiceRoomEvents('room-1');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, event.id);
  assert.deepEqual(events[0]?.metadata, { client: 'web', region: 'us-east' });

  const webhook = store2.getMarketplaceWebhook('freeblackmarket', 'evt-123');
  assert.ok(webhook, 'webhook should hydrate by composite key');
  assert.equal(webhook?.signatureOk, true);
  assert.deepEqual(webhook?.payload, { kind: 'purchase.succeeded', amount: 500 });

  const aid = store2.listCoalitionAidPosts().find((p) => p.id === 'aidp-test-1');
  assert.ok(aid, 'aid post should hydrate');
  assert.equal(aid?.location.latitude, 40.7128);
  assert.equal(aid?.location.longitude, -74.006);
  assert.equal(aid?.location.address, '12 Sunrise Way');
  assert.equal(aid?.urgency, 'high');

  assert.ok(store2.getLinkedAccount(userId, 'twitch'), 'twitch link should survive');
  assert.equal(
    store2.getLinkedAccount(userId, 'youtube'),
    undefined,
    'deleted youtube link should not hydrate',
  );

  // Growth ledger survives restart — this is the creator-driven-sales backbone.
  const referral = store2.getReferral('ref-test-1');
  assert.ok(referral, 'referral should hydrate');
  assert.equal(referral?.referrerUserId, userId);
  assert.equal(referral?.sourceKind, 'creator_invite');
  // The pg writer omits NULL columns on hydration (null → undefined), matching
  // every other nullable column in the store; assert nullish rather than strict null.
  assert.ok(referral?.rewardCents == null, 'unset rewardCents hydrates nullish');

  const quest = store2.getQuest('qst-test-1');
  assert.ok(quest, 'quest should hydrate');
  assert.deepEqual(quest?.criteria, { minDurationSeconds: 30, tag: 'build' });

  const reward = store2.getBountyRewardByBounty('bounty-1');
  assert.ok(reward, 'bounty reward should hydrate by bounty id');
  assert.equal(reward?.beneficiaryId, 'creator-9');
  assert.equal(reward?.rewardCents, 500);
  assert.equal(reward?.status, 'earned');
});

test('updateClip write-through persists the patch (PATCH /clips/:id path)', async () => {
  const { pool } = await freshDb();

  const store1 = new PostgresBackedDb();
  await store1.init(pool);

  const clipId = randomUUID();
  store1.upsertClip({
    id: clipId,
    creatorId: 'creator-1',
    sourceStreamId: 'stream-1',
    title: 'Original title',
    mediaPointer: 'mxc://server/original',
    durationSeconds: 30,
    visibility: 'public',
    tags: ['raw'],
  });

  // The clip PATCH endpoint applies a partial update via updateClip. In
  // Postgres mode this must reach the database, not just the in-memory mirror
  // — otherwise the edit is silently lost on restart / across replicas.
  const updated = store1.updateClip(clipId, {
    title: 'Edited title',
    visibility: 'member_only',
    tags: ['edited', 'highlight'],
  });
  assert.ok(updated, 'updateClip should return the patched record');
  assert.equal(updated?.title, 'Edited title');

  await store1.drain();

  // Simulate a restart: a fresh store hydrating from the same database must
  // observe the patch (it would not if updateClip skipped write-through).
  const store2 = new PostgresBackedDb();
  await store2.init(pool);

  const hydrated = store2.getClip(clipId);
  assert.ok(hydrated, 'clip should hydrate after restart');
  assert.equal(hydrated?.title, 'Edited title');
  assert.equal(hydrated?.visibility, 'member_only');
  assert.deepEqual(hydrated?.tags, ['edited', 'highlight']);
});
