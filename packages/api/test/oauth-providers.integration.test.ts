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

process.env.DISCORD_CLIENT_ID = 'test-discord-client-id';
process.env.DISCORD_CLIENT_SECRET = 'test-discord-client-secret';
process.env.DISCORD_OAUTH_REDIRECT_URI = 'http://localhost:3000/oauth/discord/callback';

process.env.PATREON_CLIENT_ID = 'test-patreon-client-id';
process.env.PATREON_CLIENT_SECRET = 'test-patreon-client-secret';
process.env.PATREON_OAUTH_REDIRECT_URI = 'http://localhost:3000/oauth/patreon/callback';

process.env.YOUTUBE_CLIENT_ID = 'test-youtube-client-id';
process.env.YOUTUBE_CLIENT_SECRET = 'test-youtube-client-secret';
process.env.YOUTUBE_OAUTH_REDIRECT_URI = 'http://localhost:3000/oauth/youtube/callback';

const loadModules = async () => {
  const secretBox = await import('../src/services/secretBox');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const discordOAuth = await import('../src/integrations/discord/oauth');
  const patreonOAuth = await import('../src/integrations/patreon/oauth');
  const youtubeOAuth = await import('../src/integrations/youtube/oauth');
  const providerFlow = await import('../src/integrations/_oauth/providerFlow');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  discordOAuth.clearDiscordOAuthConfigCache();
  patreonOAuth.clearPatreonOAuthConfigCache();
  youtubeOAuth.clearYoutubeOAuthConfigCache();
  return {
    secretBox,
    linkedAccounts,
    discordOAuth,
    patreonOAuth,
    youtubeOAuth,
    providerFlow,
    db: store.db,
  };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `user-${id.slice(0, 4)}`,
    email: `user-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

// ---------------- Discord ----------------

test('discordOAuth: beginLinkFlow builds discord.com authorize URL with PKCE', async () => {
  const { discordOAuth, providerFlow, db } = await loadModules();
  const user = await seedUser(db);
  const result = discordOAuth.beginLinkFlow(user.id);
  assert.ok(result.authorizeUrl.startsWith('https://discord.com/oauth2/authorize?'));
  assert.match(result.authorizeUrl, /response_type=code/);
  assert.match(result.authorizeUrl, /code_challenge_method=S256/);
  assert.match(result.authorizeUrl, /prompt=consent/);
  assert.match(result.authorizeUrl, /scope=identify\+email/);

  const stateHash = providerFlow.__test__.sha256Hex(result.state);
  const pending = db.pendingOAuthLinks.get(stateHash);
  assert.ok(pending);
  assert.equal(pending!.provider, 'discord');
});

test('discordOAuth: completeLinkFlow exchanges code, parses /users/@me, persists encrypted link', async () => {
  const { discordOAuth, linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);
  const begun = discordOAuth.beginLinkFlow(user.id);

  let calls = 0;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://discord.com/api/oauth2/token') {
      const body = String(init?.body ?? '');
      assert.match(body, /grant_type=authorization_code/);
      assert.match(body, /code=disc-code/);
      assert.match(body, /code_verifier=/);
      return new Response(
        JSON.stringify({
          access_token: 'discord-access',
          refresh_token: 'discord-refresh',
          expires_in: 604800,
          scope: 'identify email',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === 'https://discord.com/api/users/@me') {
      const headers = init?.headers as Record<string, string> | undefined;
      assert.equal(headers?.authorization, 'Bearer discord-access');
      // Discord identity endpoint should NOT need a Client-Id header (unlike Twitch).
      assert.equal(headers?.['client-id'], undefined);
      return new Response(
        JSON.stringify({
          id: '987654321',
          username: 'legacyname',
          global_name: 'AliceDisplay',
          discriminator: '0',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    assert.fail(`unexpected fetch URL: ${url}`);
  }) as unknown as typeof fetch;

  const outcome = await discordOAuth.completeLinkFlow(
    { userId: user.id, code: 'disc-code', state: begun.state },
    { fetch: stubFetch },
  );
  assert.equal(calls, 2);
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind !== 'ok') return;
  assert.equal(outcome.record.providerUserId, '987654321');
  // global_name should win over the legacy username when present.
  assert.equal(outcome.record.providerUsername, 'AliceDisplay');
  assert.deepEqual(outcome.record.scopes, ['identify', 'email']);

  const decrypted = linkedAccounts.decryptLinkedAccount(user.id, 'discord');
  assert.equal(decrypted!.accessToken, 'discord-access');
  assert.equal(decrypted!.refreshToken, 'discord-refresh');
});

test('discordOAuth: parseIdentity falls back to legacy username when global_name is null', async () => {
  const { discordOAuth, db } = await loadModules();
  const user = await seedUser(db);
  const begun = discordOAuth.beginLinkFlow(user.id);

  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://discord.com/api/oauth2/token') {
      return new Response(
        JSON.stringify({ access_token: 'a', expires_in: 100, scope: 'identify' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ id: '111', username: 'legacy_only', global_name: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const outcome = await discordOAuth.completeLinkFlow(
    { userId: user.id, code: 'c', state: begun.state },
    { fetch: stubFetch },
  );
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind === 'ok') {
    assert.equal(outcome.record.providerUsername, 'legacy_only');
  }
});

// ---------------- Patreon ----------------

test('patreonOAuth: beginLinkFlow builds patreon.com authorize URL with PKCE', async () => {
  const { patreonOAuth, providerFlow, db } = await loadModules();
  const user = await seedUser(db);
  const result = patreonOAuth.beginLinkFlow(user.id);
  assert.ok(result.authorizeUrl.startsWith('https://www.patreon.com/oauth2/authorize?'));
  assert.match(result.authorizeUrl, /response_type=code/);
  assert.match(result.authorizeUrl, /code_challenge_method=S256/);
  // Default Patreon scopes include `identity` and `campaigns`.
  assert.match(result.authorizeUrl, /scope=identity/);

  const stateHash = providerFlow.__test__.sha256Hex(result.state);
  const pending = db.pendingOAuthLinks.get(stateHash);
  assert.ok(pending);
  assert.equal(pending!.provider, 'patreon');
});

test('patreonOAuth: completeLinkFlow parses JSON:API identity envelope', async () => {
  const { patreonOAuth, linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);
  const begun = patreonOAuth.beginLinkFlow(user.id);

  let calls = 0;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://www.patreon.com/api/oauth2/token') {
      const body = String(init?.body ?? '');
      assert.match(body, /grant_type=authorization_code/);
      return new Response(
        JSON.stringify({
          access_token: 'patreon-access',
          refresh_token: 'patreon-refresh',
          expires_in: 2678400,
          scope: 'identity campaigns campaigns.members',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    // Patreon identity URL has the fields[user] query param baked in.
    assert.ok(
      url.startsWith('https://www.patreon.com/api/oauth2/v2/identity?'),
      `unexpected identity URL: ${url}`,
    );
    assert.match(url, /fields%5Buser%5D=full_name/);
    return new Response(
      JSON.stringify({
        data: {
          id: 'patron-42',
          type: 'user',
          attributes: { full_name: 'Charlie Patreon', vanity: 'charliep' },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const outcome = await patreonOAuth.completeLinkFlow(
    { userId: user.id, code: 'pat-code', state: begun.state },
    { fetch: stubFetch },
  );
  assert.equal(calls, 2);
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind !== 'ok') return;
  assert.equal(outcome.record.providerUserId, 'patron-42');
  assert.equal(outcome.record.providerUsername, 'Charlie Patreon');
  assert.deepEqual(outcome.record.scopes, ['identity', 'campaigns', 'campaigns.members']);

  const decrypted = linkedAccounts.decryptLinkedAccount(user.id, 'patreon');
  assert.equal(decrypted!.accessToken, 'patreon-access');
  assert.equal(decrypted!.refreshToken, 'patreon-refresh');
});

test('patreonOAuth: parseIdentity returns null when data envelope is missing', async () => {
  const { patreonOAuth, db } = await loadModules();
  const user = await seedUser(db);
  const begun = patreonOAuth.beginLinkFlow(user.id);

  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://www.patreon.com/api/oauth2/token') {
      return new Response(
        JSON.stringify({ access_token: 'a', expires_in: 100, scope: 'identity' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  const outcome = await patreonOAuth.completeLinkFlow(
    { userId: user.id, code: 'c', state: begun.state },
    { fetch: stubFetch },
  );
  assert.equal(outcome.kind, 'identity_lookup_failed');
});

// ---------------- cross-provider isolation ----------------

test('cross-provider: state issued for discord cannot be replayed against patreon', async () => {
  const { discordOAuth, patreonOAuth, db } = await loadModules();
  const user = await seedUser(db);
  const begun = discordOAuth.beginLinkFlow(user.id);
  // Try to use the discord state for a patreon callback.
  const outcome = await patreonOAuth.completeLinkFlow(
    { userId: user.id, code: 'c', state: begun.state },
    { fetch: (() => assert.fail('fetch must not be called on cross-provider replay')) as unknown as typeof fetch },
  );
  assert.equal(outcome.kind, 'state_mismatch');
});

test('cross-provider: linking the same user to multiple providers persists distinct rows', async () => {
  const { discordOAuth, patreonOAuth, linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);

  const discBegun = discordOAuth.beginLinkFlow(user.id);
  const patBegun = patreonOAuth.beginLinkFlow(user.id);

  const discFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return url === 'https://discord.com/api/oauth2/token'
      ? new Response(JSON.stringify({ access_token: 'd-a', expires_in: 100, scope: 'identify' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      : new Response(JSON.stringify({ id: 'd-1', username: 'd', global_name: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
  }) as unknown as typeof fetch;

  const patFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return url === 'https://www.patreon.com/api/oauth2/token'
      ? new Response(
          JSON.stringify({ access_token: 'p-a', expires_in: 100, scope: 'identity' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      : new Response(
          JSON.stringify({ data: { id: 'p-1', type: 'user', attributes: { full_name: 'P' } } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
  }) as unknown as typeof fetch;

  const [discOutcome, patOutcome] = await Promise.all([
    discordOAuth.completeLinkFlow({ userId: user.id, code: 'c', state: discBegun.state }, { fetch: discFetch }),
    patreonOAuth.completeLinkFlow({ userId: user.id, code: 'c', state: patBegun.state }, { fetch: patFetch }),
  ]);
  assert.equal(discOutcome.kind, 'ok');
  assert.equal(patOutcome.kind, 'ok');

  const summaries = linkedAccounts.listLinkedAccounts(user.id);
  assert.equal(summaries.length, 2);
  const providers = summaries.map((s) => s.provider).sort();
  assert.deepEqual(providers, ['discord', 'patreon']);
});

test('linkedAccounts service: missing provider OAuth config throws on connect', async () => {
  const { discordOAuth } = await loadModules();
  const saved = process.env.DISCORD_CLIENT_ID;
  delete process.env.DISCORD_CLIENT_ID;
  discordOAuth.clearDiscordOAuthConfigCache();
  try {
    assert.throws(() => discordOAuth.beginLinkFlow('anyone'), /DISCORD_CLIENT_ID/);
  } finally {
    process.env.DISCORD_CLIENT_ID = saved;
    discordOAuth.clearDiscordOAuthConfigCache();
  }
});

// ---------------- YouTube (Google OAuth) ----------------

test('youtubeOAuth: beginLinkFlow builds Google authorize URL with offline access + consent prompt', async () => {
  const { youtubeOAuth, providerFlow, db } = await loadModules();
  const user = await seedUser(db);
  const result = youtubeOAuth.beginLinkFlow(user.id);
  assert.ok(result.authorizeUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
  assert.match(result.authorizeUrl, /response_type=code/);
  assert.match(result.authorizeUrl, /code_challenge_method=S256/);
  // Google-specific: offline access is required to receive a refresh_token,
  // and prompt=consent ensures the refresh_token is reissued on every relink.
  assert.match(result.authorizeUrl, /access_type=offline/);
  assert.match(result.authorizeUrl, /prompt=consent/);
  // Default scopes include both OIDC identity (openid/email/profile) and
  // youtube.readonly for Phase 1 chat ingress.
  assert.match(result.authorizeUrl, /scope=openid\+email\+profile/);
  assert.match(result.authorizeUrl, /youtube\.readonly/);

  const stateHash = providerFlow.__test__.sha256Hex(result.state);
  const pending = db.pendingOAuthLinks.get(stateHash);
  assert.ok(pending);
  assert.equal(pending!.provider, 'youtube');
});

test('youtubeOAuth: completeLinkFlow parses OIDC userinfo and persists encrypted link', async () => {
  const { youtubeOAuth, linkedAccounts, db } = await loadModules();
  const user = await seedUser(db);
  const begun = youtubeOAuth.beginLinkFlow(user.id);

  let calls = 0;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://oauth2.googleapis.com/token') {
      const body = String(init?.body ?? '');
      assert.match(body, /grant_type=authorization_code/);
      assert.match(body, /code=yt-code/);
      assert.match(body, /code_verifier=/);
      return new Response(
        JSON.stringify({
          access_token: 'google-access',
          refresh_token: 'google-refresh',
          expires_in: 3599,
          scope:
            'openid email profile https://www.googleapis.com/auth/youtube.readonly',
          token_type: 'Bearer',
          id_token: 'jwt-redacted',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
      const headers = init?.headers as Record<string, string> | undefined;
      assert.equal(headers?.authorization, 'Bearer google-access');
      return new Response(
        JSON.stringify({
          sub: '101234567890123456789',
          name: 'Diana Streamer',
          email: 'diana@example.com',
          picture: 'https://lh3.googleusercontent.com/x',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    assert.fail(`unexpected fetch URL: ${url}`);
  }) as unknown as typeof fetch;

  const outcome = await youtubeOAuth.completeLinkFlow(
    { userId: user.id, code: 'yt-code', state: begun.state },
    { fetch: stubFetch },
  );
  assert.equal(calls, 2);
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind !== 'ok') return;
  // The provider id is `sub` (stable Google account id), NOT a YouTube
  // channel id, because OIDC userinfo doesn't carry channel info. Channel
  // discovery happens in Phase 1 via the youtube.readonly scope.
  assert.equal(outcome.record.providerUserId, '101234567890123456789');
  assert.equal(outcome.record.providerUsername, 'Diana Streamer');
  assert.ok(outcome.record.scopes.includes('openid'));
  assert.ok(outcome.record.scopes.includes('https://www.googleapis.com/auth/youtube.readonly'));

  const decrypted = linkedAccounts.decryptLinkedAccount(user.id, 'youtube');
  assert.equal(decrypted!.accessToken, 'google-access');
  assert.equal(decrypted!.refreshToken, 'google-refresh');
});

test('youtubeOAuth: parseIdentity falls back to email when name is absent', async () => {
  const { youtubeOAuth, db } = await loadModules();
  const user = await seedUser(db);
  const begun = youtubeOAuth.beginLinkFlow(user.id);

  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(
        JSON.stringify({ access_token: 'a', expires_in: 100, scope: 'openid' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ sub: '999', email: 'fallback@example.com' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const outcome = await youtubeOAuth.completeLinkFlow(
    { userId: user.id, code: 'c', state: begun.state },
    { fetch: stubFetch },
  );
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind === 'ok') {
    assert.equal(outcome.record.providerUsername, 'fallback@example.com');
  }
});
