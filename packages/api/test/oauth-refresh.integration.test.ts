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

process.env.TWITCH_CLIENT_ID = 'test-twitch-client-id';
process.env.TWITCH_CLIENT_SECRET = 'test-twitch-client-secret';
process.env.TWITCH_OAUTH_REDIRECT_URI = 'http://localhost:3000/oauth/twitch/callback';

process.env.YOUTUBE_CLIENT_ID = 'test-youtube-client-id';
process.env.YOUTUBE_CLIENT_SECRET = 'test-youtube-client-secret';
process.env.YOUTUBE_OAUTH_REDIRECT_URI = 'http://localhost:3000/oauth/youtube/callback';

const loadModules = async () => {
  const secretBox = await import('../src/services/secretBox');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const twitchOAuth = await import('../src/integrations/twitch/oauth');
  const youtubeOAuth = await import('../src/integrations/youtube/oauth');
  const oauthProviders = await import('../src/services/oauthProviders');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  twitchOAuth.clearTwitchOAuthConfigCache();
  youtubeOAuth.clearYoutubeOAuthConfigCache();
  return { secretBox, linkedAccounts, twitchOAuth, youtubeOAuth, oauthProviders, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `refresh-${id.slice(0, 4)}`,
    email: `refresh-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

const seedLinkedAccount = async (
  userId: string,
  opts: {
    provider: 'twitch' | 'youtube';
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds?: number;
  },
) => {
  const { linkedAccounts } = await loadModules();
  return linkedAccounts.upsertLinkedAccount({
    blackoutUserId: userId,
    provider: opts.provider,
    providerUserId: `${opts.provider}-user-id`,
    providerUsername: 'streamer',
    tokens: {
      accessToken: opts.accessToken,
      refreshToken: opts.refreshToken,
      expiresInSeconds: opts.expiresInSeconds,
      scopes: [],
    },
  });
};

// ---------------- refresh flow happy path ----------------

test('refreshLinkedAccount (twitch): swaps access + refresh tokens on success', async () => {
  const { twitchOAuth, linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);
  await seedLinkedAccount(user.id, {
    provider: 'twitch',
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    expiresInSeconds: 60,
  });

  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    assert.equal(url, 'https://id.twitch.tv/oauth2/token');
    const body = String(init?.body ?? '');
    assert.match(body, /grant_type=refresh_token/);
    assert.match(body, /refresh_token=old-refresh/);
    return new Response(
      JSON.stringify({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 14400,
        scope: ['user:read:email'],
        token_type: 'bearer',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const outcome = await twitchOAuth.refreshLinkedAccount(user.id, { fetch: stubFetch });
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind === 'ok') {
    assert.equal(outcome.accessToken, 'new-access');
    assert.ok(outcome.expiresAt);
  }

  const decrypted = linkedAccounts.decryptLinkedAccount(user.id, 'twitch');
  assert.equal(decrypted!.accessToken, 'new-access');
  // Twitch reissues refresh tokens — old one must be replaced.
  assert.equal(decrypted!.refreshToken, 'new-refresh');
});

test('refreshLinkedAccount (youtube): keeps old refresh_token when Google omits it', async () => {
  const { youtubeOAuth, linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);
  await seedLinkedAccount(user.id, {
    provider: 'youtube',
    accessToken: 'old-google-access',
    refreshToken: 'sticky-google-refresh',
    expiresInSeconds: 30,
  });

  const stubFetch: typeof fetch = (async () =>
    new Response(
      // Note: NO refresh_token in the response — Google's refresh-grant doesn't
      // reissue them on every call. The provider must keep the old one.
      JSON.stringify({
        access_token: 'new-google-access',
        expires_in: 3599,
        scope: 'openid profile https://www.googleapis.com/auth/youtube.readonly',
        token_type: 'Bearer',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch;

  const outcome = await youtubeOAuth.refreshLinkedAccount(user.id, { fetch: stubFetch });
  assert.equal(outcome.kind, 'ok');

  const decrypted = linkedAccounts.decryptLinkedAccount(user.id, 'youtube');
  assert.equal(decrypted!.accessToken, 'new-google-access');
  // Google did NOT reissue → we must keep the original refresh token.
  assert.equal(decrypted!.refreshToken, 'sticky-google-refresh');
});

// ---------------- refresh flow failure modes ----------------

test('refreshLinkedAccount: returns no_link when user has no link for the provider', async () => {
  const { twitchOAuth, db } = await loadModules();
  const user = await seedUser(db);
  const outcome = await twitchOAuth.refreshLinkedAccount(user.id, {
    fetch: (() => assert.fail('fetch must not be called when no link exists')) as unknown as typeof fetch,
  });
  assert.equal(outcome.kind, 'no_link');
});

test('refreshLinkedAccount: returns no_refresh_token when only access_token is stored', async () => {
  const { twitchOAuth, db } = await loadModules();
  const user = await seedUser(db);
  await seedLinkedAccount(user.id, {
    provider: 'twitch',
    accessToken: 'lone-access',
    refreshToken: undefined,
    expiresInSeconds: 5,
  });
  const outcome = await twitchOAuth.refreshLinkedAccount(user.id, {
    fetch: (() => assert.fail('fetch must not be called without a refresh token')) as unknown as typeof fetch,
  });
  assert.equal(outcome.kind, 'no_refresh_token');
});

test('refreshLinkedAccount: surfaces upstream HTTP error as refresh_failed', async () => {
  const { twitchOAuth, db } = await loadModules();
  const user = await seedUser(db);
  await seedLinkedAccount(user.id, {
    provider: 'twitch',
    accessToken: 'a',
    refreshToken: 'r',
    expiresInSeconds: 5,
  });
  const stubFetch: typeof fetch = (async () =>
    new Response('{"status":401,"message":"Invalid refresh token"}', { status: 401 })) as unknown as typeof fetch;
  const outcome = await twitchOAuth.refreshLinkedAccount(user.id, { fetch: stubFetch });
  assert.equal(outcome.kind, 'refresh_failed');
  if (outcome.kind === 'refresh_failed') assert.equal(outcome.status, 401);
});

// ---------------- ensureFreshAccessToken ----------------

test('ensureFreshAccessToken: returns current token when it is well within freshness window', async () => {
  const { oauthProviders, db } = await loadModules();
  const user = await seedUser(db);
  await seedLinkedAccount(user.id, {
    provider: 'twitch',
    accessToken: 'still-fresh',
    refreshToken: 'r',
    expiresInSeconds: 3600,
  });

  const outcome = await oauthProviders.ensureFreshAccessToken(user.id, 'twitch', {
    fetch: (() => assert.fail('fetch must not be called for fresh tokens')) as unknown as typeof fetch,
  });
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind === 'ok') {
    assert.equal(outcome.accessToken, 'still-fresh');
    assert.equal(outcome.rotated, false);
  }
});

test('ensureFreshAccessToken: refreshes when the current token is within the leeway window', async () => {
  const { oauthProviders, linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);
  // Token "expires" 30 seconds from now; default leeway is 60s → must refresh.
  await seedLinkedAccount(user.id, {
    provider: 'twitch',
    accessToken: 'about-to-expire',
    refreshToken: 'good-refresh',
    expiresInSeconds: 30,
  });

  const stubFetch: typeof fetch = (async () =>
    new Response(
      JSON.stringify({
        access_token: 'fresh-access',
        refresh_token: 'fresh-refresh',
        expires_in: 14400,
        scope: ['user:read:email'],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch;

  const outcome = await oauthProviders.ensureFreshAccessToken(user.id, 'twitch', { fetch: stubFetch });
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind === 'ok') {
    assert.equal(outcome.accessToken, 'fresh-access');
    assert.equal(outcome.rotated, true);
  }
  const decrypted = linkedAccounts.decryptLinkedAccount(user.id, 'twitch');
  assert.equal(decrypted!.accessToken, 'fresh-access');
});

test('ensureFreshAccessToken: forceRefresh bypasses the freshness check', async () => {
  const { oauthProviders, db } = await loadModules();
  const user = await seedUser(db);
  await seedLinkedAccount(user.id, {
    provider: 'twitch',
    accessToken: 'a',
    refreshToken: 'r',
    expiresInSeconds: 3600,
  });

  let calls = 0;
  const stubFetch: typeof fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ access_token: 'forced', refresh_token: 'forced-r', expires_in: 14400, scope: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const outcome = await oauthProviders.ensureFreshAccessToken(user.id, 'twitch', {
    fetch: stubFetch,
    forceRefresh: true,
  });
  assert.equal(calls, 1, 'forceRefresh should always make the upstream call');
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind === 'ok') assert.equal(outcome.rotated, true);
});

test('ensureFreshAccessToken: returns provider_not_implemented for not-yet-wired providers', async () => {
  const { oauthProviders, db } = await loadModules();
  const user = await seedUser(db);
  const outcome = await oauthProviders.ensureFreshAccessToken(user.id, 'tiktok');
  assert.equal(outcome.kind, 'provider_not_implemented');
});

test('ensureFreshAccessToken: returns no_link when the user is not linked to the provider', async () => {
  const { oauthProviders, db } = await loadModules();
  const user = await seedUser(db);
  const outcome = await oauthProviders.ensureFreshAccessToken(user.id, 'twitch');
  assert.equal(outcome.kind, 'no_link');
});

test('ensureFreshAccessToken: surfaces refresh_failed without falling back to the stale token', async () => {
  const { oauthProviders, db } = await loadModules();
  const user = await seedUser(db);
  await seedLinkedAccount(user.id, {
    provider: 'twitch',
    accessToken: 'stale',
    refreshToken: 'bad-refresh',
    expiresInSeconds: 5,
  });
  const stubFetch: typeof fetch = (async () =>
    new Response('{"error":"invalid_grant"}', { status: 400 })) as unknown as typeof fetch;
  const outcome = await oauthProviders.ensureFreshAccessToken(user.id, 'twitch', { fetch: stubFetch });
  assert.equal(outcome.kind, 'refresh_failed');
});
