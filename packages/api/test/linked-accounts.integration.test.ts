import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

// Two 32-byte AES-256 keys: a primary (v1) for new encryption + a rollover
// (v0) so we can prove the decryption fallback path works on key rotation.
const KEY_V1 = randomBytes(32).toString('base64');
const KEY_V0 = randomBytes(32).toString('base64');

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1},v0:${KEY_V0}`;
process.env.TWITCH_CLIENT_ID = 'test-twitch-client-id';
process.env.TWITCH_CLIENT_SECRET = 'test-twitch-client-secret';
process.env.TWITCH_OAUTH_REDIRECT_URI = 'http://localhost:3000/oauth/twitch/callback';

const loadModules = async () => {
  const secretBox = await import('../src/services/secretBox');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const twitchOAuth = await import('../src/integrations/twitch/oauth');
  const store = await import('../src/db/store');
  // Reset cached module-level config so tests are independent of import order.
  secretBox.clearSecretBoxConfigCache();
  twitchOAuth.clearTwitchOAuthConfigCache();
  return { secretBox, linkedAccounts, twitchOAuth, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `link-${id.slice(0, 4)}`,
    email: `link-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

// ---------------- secretBox roundtrip + key rotation ----------------

test('secretBox: encrypt/decrypt roundtrips arbitrary plaintext', async () => {
  const { secretBox } = await loadModules();
  const plaintext = 'twitch-oauth-token-' + randomBytes(8).toString('hex');
  const env = secretBox.encryptSecret(plaintext);
  assert.equal(secretBox.decryptSecret(env), plaintext);
});

test('secretBox: tampered ciphertext fails GCM auth tag verification', async () => {
  const { secretBox } = await loadModules();
  const env = secretBox.encryptSecret('hello world');
  // Flip a bit in the ciphertext (third colon-segment).
  const parts = env.split(':');
  const tampered = Buffer.from(parts[2], 'base64url');
  tampered[0] ^= 0x01;
  parts[2] = tampered.toString('base64url');
  assert.throws(() => secretBox.decryptSecret(parts.join(':')));
});

test('secretBox: AAD mismatch rejects decryption', async () => {
  const { secretBox } = await loadModules();
  const env = secretBox.encryptSecret('hello', { aad: 'context-A' });
  assert.throws(() => secretBox.decryptSecret(env, { aad: 'context-B' }));
  assert.equal(secretBox.decryptSecret(env, { aad: 'context-A' }), 'hello');
});

test('secretBox: rollover key still decrypts old envelopes after key rotation', async () => {
  const { secretBox } = await loadModules();

  // First, encrypt with v0 as primary (simulate the "old world").
  process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v0:${KEY_V0}`;
  secretBox.clearSecretBoxConfigCache();
  const oldEnvelope = secretBox.encryptSecret('legacy-token');
  assert.ok(oldEnvelope.startsWith('v0:'));

  // Rotate: v1 becomes primary, v0 is kept as a rollover decrypt key.
  process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1},v0:${KEY_V0}`;
  secretBox.clearSecretBoxConfigCache();

  // Old envelope is still readable.
  assert.equal(secretBox.decryptSecret(oldEnvelope), 'legacy-token');

  // New encryptions use v1.
  const newEnvelope = secretBox.encryptSecret('new-token');
  assert.ok(newEnvelope.startsWith('v1:'));
  assert.equal(secretBox.envelopeKeyId(newEnvelope), 'v1');
});

// ---------------- linkedAccounts service ----------------

test('linkedAccounts: upsert encrypts tokens and never returns plaintext via summary', async () => {
  const { linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);

  const record = linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'twitch',
    providerUserId: 'twitch-12345',
    providerUsername: 'streamer-alice',
    tokens: {
      accessToken: 'plain-access-abc',
      refreshToken: 'plain-refresh-xyz',
      expiresInSeconds: 3600,
      scopes: ['user:read:email'],
    },
  });

  assert.notEqual(record.accessTokenCiphertext, 'plain-access-abc');
  assert.notEqual(record.refreshTokenCiphertext, 'plain-refresh-xyz');
  assert.ok(record.accessTokenCiphertext.startsWith('v1:'));
  assert.ok(record.expiresAt && new Date(record.expiresAt).getTime() > Date.now());

  const summaries = linkedAccounts.listLinkedAccounts(user.id);
  assert.equal(summaries.length, 1);
  const summary = summaries[0];
  assert.equal(summary.provider, 'twitch');
  assert.equal(summary.providerUserId, 'twitch-12345');
  assert.equal(summary.providerUsername, 'streamer-alice');
  // Critical: summary projection must not leak ciphertext or any plaintext token.
  assert.equal(
    Object.keys(summary).filter((k) => k.toLowerCase().includes('token')).length,
    0,
    'summary leaked a *Token* field',
  );
});

test('linkedAccounts: upsert replaces existing link for (user, provider)', async () => {
  const { linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);

  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'twitch',
    providerUserId: 'twitch-1',
    tokens: { accessToken: 'a1', scopes: [] },
  });
  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'twitch',
    providerUserId: 'twitch-2',
    tokens: { accessToken: 'a2', scopes: ['scope2'] },
  });

  const summaries = linkedAccounts.listLinkedAccounts(user.id);
  assert.equal(summaries.length, 1, 'expected exactly one twitch link after upsert');
  assert.equal(summaries[0].providerUserId, 'twitch-2');
  assert.deepEqual(summaries[0].scopes, ['scope2']);
});

test('linkedAccounts: decryptLinkedAccount returns plaintext tokens for server-internal use', async () => {
  const { linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);
  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'twitch',
    providerUserId: 'twitch-99',
    tokens: { accessToken: 'plain-access-99', refreshToken: 'plain-refresh-99', scopes: [] },
  });

  const decrypted = linkedAccounts.decryptLinkedAccount(user.id, 'twitch');
  assert.ok(decrypted);
  assert.equal(decrypted!.accessToken, 'plain-access-99');
  assert.equal(decrypted!.refreshToken, 'plain-refresh-99');
});

test('linkedAccounts: unlinkAccount removes the row and is idempotent', async () => {
  const { linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);

  assert.equal(linkedAccounts.unlinkAccount(user.id, 'twitch'), false, 'no-op when nothing linked');
  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'twitch',
    providerUserId: 'twitch-7',
    tokens: { accessToken: 'a', scopes: [] },
  });
  assert.equal(linkedAccounts.unlinkAccount(user.id, 'twitch'), true);
  assert.equal(linkedAccounts.listLinkedAccounts(user.id).length, 0);
  assert.equal(linkedAccounts.unlinkAccount(user.id, 'twitch'), false, 'second call is idempotent');
});

// ---------------- twitch OAuth state lifecycle ----------------

test('twitchOAuth: beginLinkFlow creates a pending link and a Twitch authorize URL', async () => {
  const { twitchOAuth, db } = await loadModules();
  const user = await seedUser(db);

  const result = twitchOAuth.beginLinkFlow(user.id);
  assert.ok(result.authorizeUrl.startsWith('https://id.twitch.tv/oauth2/authorize?'));
  assert.match(result.authorizeUrl, /code_challenge=/);
  assert.match(result.authorizeUrl, /code_challenge_method=S256/);
  assert.match(result.authorizeUrl, /response_type=code/);
  assert.match(result.authorizeUrl, new RegExp(`state=${result.state}`));
  assert.ok(result.state.length >= 32);

  const stateHash = twitchOAuth.__test__.sha256Hex(result.state);
  const pending = db.pendingOAuthLinks.get(stateHash);
  assert.ok(pending, 'pending link should be persisted');
  assert.equal(pending!.blackoutUserId, user.id);
  assert.equal(pending!.provider, 'twitch');
  assert.ok(pending!.codeVerifierCiphertext.startsWith('v1:'));
  assert.ok(!pending!.consumedAt);
});

test('twitchOAuth: completeLinkFlow rejects invalid state', async () => {
  const { twitchOAuth, db } = await loadModules();
  const user = await seedUser(db);
  const outcome = await twitchOAuth.completeLinkFlow(
    { userId: user.id, code: 'whatever', state: 'never-issued' },
    { fetch: (() => assert.fail('fetch must not be called when state is invalid')) as unknown as typeof fetch },
  );
  assert.equal(outcome.kind, 'state_invalid');
});

test('twitchOAuth: completeLinkFlow rejects if a different user presents a valid state', async () => {
  const { twitchOAuth, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);

  const begun = twitchOAuth.beginLinkFlow(alice.id);
  const outcome = await twitchOAuth.completeLinkFlow(
    { userId: bob.id, code: 'code', state: begun.state },
    { fetch: (() => assert.fail('fetch must not be called when state user mismatches')) as unknown as typeof fetch },
  );
  assert.equal(outcome.kind, 'state_mismatch');
});

test('twitchOAuth: completeLinkFlow exchanges code, fetches identity, persists encrypted link', async () => {
  const { twitchOAuth, linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);
  const begun = twitchOAuth.beginLinkFlow(user.id);

  // Stub fetch: first call = token endpoint; second call = users endpoint.
  let calls = 0;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://id.twitch.tv/oauth2/token') {
      const body = String(init?.body ?? '');
      assert.match(body, /grant_type=authorization_code/);
      assert.match(body, /code=fake-code/);
      assert.match(body, /code_verifier=/);
      return new Response(
        JSON.stringify({
          access_token: 'twitch-access-token',
          refresh_token: 'twitch-refresh-token',
          expires_in: 14400,
          scope: ['user:read:email', 'channel:read:subscriptions'],
          token_type: 'bearer',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === 'https://api.twitch.tv/helix/users') {
      const headers = init?.headers as Record<string, string> | undefined;
      assert.equal(headers?.['authorization'], 'Bearer twitch-access-token');
      assert.equal(headers?.['client-id'], 'test-twitch-client-id');
      return new Response(
        JSON.stringify({ data: [{ id: '54321', login: 'streamer_bob', display_name: 'StreamerBob' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    assert.fail(`unexpected fetch URL: ${url}`);
  }) as unknown as typeof fetch;

  const outcome = await twitchOAuth.completeLinkFlow(
    { userId: user.id, code: 'fake-code', state: begun.state },
    { fetch: stubFetch },
  );
  assert.equal(calls, 2);
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind !== 'ok') return;
  assert.equal(outcome.record.providerUserId, '54321');
  assert.equal(outcome.record.providerUsername, 'StreamerBob');
  assert.deepEqual(outcome.record.scopes, ['user:read:email', 'channel:read:subscriptions']);

  const decrypted = linkedAccounts.decryptLinkedAccount(user.id, 'twitch');
  assert.equal(decrypted!.accessToken, 'twitch-access-token');
  assert.equal(decrypted!.refreshToken, 'twitch-refresh-token');

  // Replaying the same state must now fail (single-use).
  const replay = await twitchOAuth.completeLinkFlow(
    { userId: user.id, code: 'fake-code', state: begun.state },
    { fetch: (() => assert.fail('fetch must not be called on replay')) as unknown as typeof fetch },
  );
  assert.equal(replay.kind, 'state_invalid');
});

test('twitchOAuth: completeLinkFlow surfaces token-exchange failure', async () => {
  const { twitchOAuth, db } = await loadModules();
  const user = await seedUser(db);
  const begun = twitchOAuth.beginLinkFlow(user.id);

  const stubFetch: typeof fetch = (async () =>
    new Response('{"status":400,"message":"Invalid authorization code"}', { status: 400 })) as unknown as typeof fetch;

  const outcome = await twitchOAuth.completeLinkFlow(
    { userId: user.id, code: 'bad-code', state: begun.state },
    { fetch: stubFetch },
  );
  assert.equal(outcome.kind, 'token_exchange_failed');
  if (outcome.kind === 'token_exchange_failed') {
    assert.equal(outcome.status, 400);
  }
});
