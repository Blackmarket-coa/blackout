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
process.env.STREAMLABS_CLIENT_ID = 'test-streamlabs-client';
process.env.STREAMLABS_CLIENT_SECRET = 'test-streamlabs-secret';
process.env.STREAMLABS_OAUTH_REDIRECT_URI =
  'http://localhost:3000/oauth/streamlabs/callback';

const loadModules = async () => {
  const oauth = await import('../src/integrations/streamlabs/oauth');
  const api = await import('../src/integrations/streamlabs/api');
  const donationEvents = await import('../src/integrations/streamlabs/donationEvents');
  const shape = await import('../src/integrations/widgets/streamlabsShape');
  const sync = await import('../src/services/streamlabsDonationSync');
  const oauthProviders = await import('../src/services/oauthProviders');
  const widgetBus = await import('../src/services/widgetBus');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const secretBox = await import('../src/services/secretBox');
  const store = await import('../src/db/store');
  oauth.clearStreamlabsOAuthConfigCache();
  secretBox.clearSecretBoxConfigCache();
  widgetBus.clearAllSubscribersForTest();
  sync.clearStreamlabsCursorsForTest();
  store.db.linkedAccounts.clear();
  return {
    oauth,
    api,
    donationEvents,
    shape,
    sync,
    oauthProviders,
    widgetBus,
    linkedAccounts,
    db: store.db,
  };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `sl-${id.slice(0, 4)}`,
    email: `sl-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

const seedStreamlabsLink = async (
  blackoutUserId: string,
  providerUserId = 'sl-99',
) => {
  const linkedAccounts = await import('../src/services/linkedAccounts');
  return linkedAccounts.upsertLinkedAccount({
    blackoutUserId,
    provider: 'streamlabs',
    providerUserId,
    providerUsername: 'TestCreator',
    tokens: {
      accessToken: 'sl-access',
      refreshToken: 'sl-refresh',
      expiresInSeconds: 3600,
      scopes: ['donations.read'],
    },
  });
};

// =============================================================================
// OAuth provider
// =============================================================================

test('streamlabs OAuth: registered in the OAUTH_PROVIDERS dispatch table', async () => {
  const { oauthProviders } = await loadModules();
  assert.ok(oauthProviders.isOAuthImplemented('streamlabs'));
  const mod = oauthProviders.getProviderOAuth('streamlabs');
  assert.ok(mod);
  assert.equal(typeof mod!.beginLinkFlow, 'function');
  assert.equal(typeof mod!.completeLinkFlow, 'function');
  assert.equal(typeof mod!.refreshLinkedAccount, 'function');
});

test('streamlabs OAuth: beginLinkFlow builds the right authorize URL with PKCE + default scopes', async () => {
  const { oauth, db } = await loadModules();
  const user = await seedUser(db);
  const result = oauth.beginLinkFlow(user.id);
  assert.ok(result.authorizeUrl.startsWith('https://www.streamlabs.com/api/v2.0/authorize?'));
  assert.match(result.authorizeUrl, /response_type=code/);
  assert.match(result.authorizeUrl, /code_challenge_method=S256/);
  // Default scopes — at minimum donations.read.
  assert.match(result.authorizeUrl, /donations\.read/);
});

// =============================================================================
// REST client
// =============================================================================

test('listDonations: passes access_token + after cursor; parses data array', async () => {
  const { api } = await loadModules();
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    assert.match(url, /^https:\/\/streamlabs\.com\/api\/v1\.0\/donations\?/);
    assert.match(url, /access_token=sl-access/);
    assert.match(url, /after=42/);
    return new Response(
      JSON.stringify({
        data: [
          {
            donation_id: 100,
            name: 'Alice',
            amount: '5.00',
            currency: 'USD',
            message: 'Hi!',
            created_at: 1700000000,
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  const out = await api.listDonations('sl-access', { after: 42, fetch: stubFetch });
  assert.equal(out.kind, 'ok');
  if (out.kind === 'ok') {
    assert.equal(out.donations.length, 1);
    assert.equal(out.donations[0].name, 'Alice');
  }
});

test('listDonations: maps 401/429/5xx to typed outcomes', async () => {
  const { api } = await loadModules();
  for (const [status, expected, retryHeader] of [
    [401, 'unauthorized', undefined],
    [429, 'rate_limited', '17'],
    [500, 'failed', undefined],
  ] as Array<[number, string, string | undefined]>) {
    const stubFetch: typeof fetch = (async () =>
      new Response('{}', {
        status,
        headers: retryHeader ? { 'retry-after': retryHeader } : undefined,
      })) as unknown as typeof fetch;
    const out = await api.listDonations('tok', { fetch: stubFetch });
    assert.equal(out.kind, expected, `status ${status}`);
    if (status === 429 && out.kind === 'rate_limited') {
      assert.equal(out.retryAfterSeconds, 17);
    }
  }
});

// =============================================================================
// normalize
// =============================================================================

test('normalizeStreamlabsDonation: blank name → "Anonymous"; created_at converted to ms', async () => {
  const { donationEvents } = await loadModules();
  const out = donationEvents.normalizeStreamlabsDonation({
    donation_id: 42,
    name: '',
    amount: '10.00',
    currency: 'USD',
    message: '',
    created_at: 1700000000,
  });
  assert.equal(out.kind, 'streamlabs_donation');
  assert.equal(out.donorName, 'Anonymous');
  assert.equal(out.amount, '10.00');
  assert.equal(out.donationId, '42');
  assert.equal(out.createdAtMs, 1700000000 * 1000);
});

// =============================================================================
// shape mapper
// =============================================================================

test('toWidgetAlertFromStreamlabs: emits Streamlabs `donation` envelope with formatted_amount', async () => {
  const { shape } = await loadModules();
  const alert = shape.toWidgetAlertFromStreamlabs({
    kind: 'streamlabs_donation',
    donationId: '42',
    donorName: 'Alice',
    amount: '5.00',
    currency: 'USD',
    message: 'Hi!',
    createdAtMs: 1700000000000,
  });
  assert.equal(alert.type, 'donation');
  assert.equal(alert.origin, 'streamlabs');
  const m = alert.message[0];
  assert.equal(m.name, 'Alice');
  assert.equal(m.amount, '5.00');
  assert.equal(m.formatted_amount, '$5.00');
  assert.equal(m.currency, 'USD');
  assert.equal(m._id, '42');
});

test('toWidgetAlertFromStreamlabs: GBP/EUR/JPY get the right currency symbols', async () => {
  const { shape } = await loadModules();
  const cases = [
    { currency: 'GBP', symbol: '£' },
    { currency: 'EUR', symbol: '€' },
    { currency: 'JPY', symbol: '¥' },
    { currency: 'CAD', symbol: 'CAD ' }, // unknown → falls back to "CAD "
  ];
  for (const { currency, symbol } of cases) {
    const alert = shape.toWidgetAlertFromStreamlabs({
      kind: 'streamlabs_donation',
      donationId: 'x',
      donorName: 'Bob',
      amount: '1.00',
      currency,
      message: '',
      createdAtMs: 0,
    });
    assert.equal(alert.message[0].formatted_amount, `${symbol}1.00`);
  }
});

// =============================================================================
// sync service
// =============================================================================

test('sync: returns no_link when the user has no Streamlabs link', async () => {
  const { sync, db } = await loadModules();
  const user = await seedUser(db);
  const out = await sync.syncStreamlabsDonationsForUser(user.id);
  assert.equal(out.kind, 'no_link');
});

test('sync: pulls donations, publishes through widgetBus, advances the cursor', async () => {
  const { sync, widgetBus, db } = await loadModules();
  const user = await seedUser(db);
  await seedStreamlabsLink(user.id);

  const events: Array<{ donationId: string; amount: string }> = [];
  const off = widgetBus.subscribe(user.id, (e) => {
    const m = e.message[0] as { _id?: string; amount?: string };
    events.push({ donationId: String(m._id), amount: String(m.amount) });
  });

  let calls = 0;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    calls += 1;
    const url = typeof input === 'string' ? input : input.toString();
    if (calls === 1) {
      // First call has no cursor; returns three donations.
      assert.doesNotMatch(url, /after=/);
      return new Response(
        JSON.stringify({
          data: [
            { donation_id: 100, name: 'A', amount: '1.00', currency: 'USD', message: '', created_at: 1700000000 },
            { donation_id: 101, name: 'B', amount: '2.00', currency: 'USD', message: '', created_at: 1700000010 },
            { donation_id: 102, name: 'C', amount: '3.00', currency: 'USD', message: '', created_at: 1700000020 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    // Second call should advance the cursor to 102.
    assert.match(url, /after=102/);
    return new Response(
      JSON.stringify({
        data: [
          { donation_id: 103, name: 'D', amount: '4.00', currency: 'USD', message: '', created_at: 1700000030 },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const first = await sync.syncStreamlabsDonationsForUser(user.id, { fetch: stubFetch });
  assert.equal(first.kind, 'ok');
  if (first.kind === 'ok') {
    assert.equal(first.newDonations, 3);
    assert.equal(first.delivered, 3);
    assert.equal(first.latestDonationId, '102');
  }

  const second = await sync.syncStreamlabsDonationsForUser(user.id, { fetch: stubFetch });
  assert.equal(second.kind, 'ok');
  if (second.kind === 'ok') {
    assert.equal(second.newDonations, 1);
    assert.equal(second.latestDonationId, '103');
  }

  assert.deepEqual(
    events.map((e) => e.donationId),
    ['100', '101', '102', '103'],
    'events arrive in chronological (ascending donation id) order',
  );
  off();
});

test('sync: surfaces 401 from listDonations as token_unavailable', async () => {
  const { sync, db } = await loadModules();
  const user = await seedUser(db);
  await seedStreamlabsLink(user.id);
  const stubFetch: typeof fetch = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
  const out = await sync.syncStreamlabsDonationsForUser(user.id, { fetch: stubFetch });
  assert.equal(out.kind, 'token_unavailable');
});

test('sync: surfaces 429 as rate_limited (with retry-after when present)', async () => {
  const { sync, db } = await loadModules();
  const user = await seedUser(db);
  await seedStreamlabsLink(user.id);
  const stubFetch: typeof fetch = (async () =>
    new Response('{}', { status: 429, headers: { 'retry-after': '5' } })) as unknown as typeof fetch;
  const out = await sync.syncStreamlabsDonationsForUser(user.id, { fetch: stubFetch });
  assert.equal(out.kind, 'rate_limited');
  if (out.kind === 'rate_limited') assert.equal(out.retryAfterSeconds, 5);
});

test('sync: persisted cursor survives a "restart" — second-process reads it from linked_accounts.sync_cursor', async () => {
  // Simulate two separate processes: each "boot" calls loadModules() (which
  // resets the secretBox cache + widgetBus subscriptions) but the in-memory
  // db survives across loadModules calls within this test file. The cursor
  // we care about lives on linked_accounts.sync_cursor — not the
  // (deleted) in-process map — so the second process should pick up where
  // the first left off.
  const firstBoot = await loadModules();
  const user = await seedUser(firstBoot.db);
  await seedStreamlabsLink(user.id);

  const stubFetch1: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    assert.doesNotMatch(url, /after=/);
    return new Response(
      JSON.stringify({
        data: [
          { donation_id: 500, name: 'A', amount: '1.00', currency: 'USD', message: '', created_at: 0 },
          { donation_id: 501, name: 'B', amount: '2.00', currency: 'USD', message: '', created_at: 0 },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  const first = await firstBoot.sync.syncStreamlabsDonationsForUser(user.id, {
    fetch: stubFetch1,
  });
  assert.equal(first.kind, 'ok');
  if (first.kind === 'ok') assert.equal(first.latestDonationId, '501');

  // Confirm the cursor was persisted.
  assert.equal(
    firstBoot.db.getLinkedAccount(user.id, 'streamlabs')?.syncCursor,
    '501',
  );

  // "Restart" — a fresh loadModules() resets in-memory caches; the
  // db.linkedAccounts map is intentionally NOT cleared here (we want to
  // verify the persisted cursor is read on the next sync call).
  // loadModules() does clear linkedAccounts, so we re-seed + re-set the
  // cursor to the value the prior boot persisted, which simulates a
  // process that woke up against the same (file-backed in production) DB.
  const cursor = '501';
  const secondBoot = await loadModules();
  await seedStreamlabsLink(user.id);
  secondBoot.db.setLinkedAccountSyncCursor(user.id, 'streamlabs', cursor);

  let secondCallSeen = false;
  const stubFetch2: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    // The crucial assertion: the second process resumes from the persisted
    // cursor, not from "no cursor".
    assert.match(url, /after=501/);
    secondCallSeen = true;
    return new Response(
      JSON.stringify({
        data: [
          { donation_id: 502, name: 'C', amount: '3.00', currency: 'USD', message: '', created_at: 0 },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  const second = await secondBoot.sync.syncStreamlabsDonationsForUser(user.id, {
    fetch: stubFetch2,
  });
  assert.equal(second.kind, 'ok');
  assert.equal(secondCallSeen, true);
  if (second.kind === 'ok') {
    assert.equal(second.newDonations, 1);
    assert.equal(second.latestDonationId, '502');
  }
});

test('sync: dryRun does NOT publish AND does NOT persist the cursor', async () => {
  const { sync, widgetBus, db } = await loadModules();
  const user = await seedUser(db);
  await seedStreamlabsLink(user.id);
  let calls = 0;
  const off = widgetBus.subscribe(user.id, () => {
    calls += 1;
  });
  const stubFetch: typeof fetch = (async () =>
    new Response(
      JSON.stringify({
        data: [
          { donation_id: 200, name: 'A', amount: '1.00', currency: 'USD', message: '', created_at: 0 },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch;

  const out = await sync.syncStreamlabsDonationsForUser(user.id, {
    fetch: stubFetch,
    dryRun: true,
  });
  assert.equal(out.kind, 'ok');
  if (out.kind === 'ok') {
    assert.equal(out.delivered, 0);
    // Returned value still reports the latest id we *saw* — useful for
    // preview UIs — but the persisted cursor must not have moved.
    assert.equal(out.latestDonationId, '200');
  }
  assert.equal(calls, 0, 'dryRun must not publish');
  // CRITICAL: the persisted cursor stays at its previous value (undefined
  // here since we never seeded one). A non-dry-run callback later would
  // re-process donation 200 and emit it for real.
  assert.equal(
    db.getLinkedAccount(user.id, 'streamlabs')?.syncCursor,
    undefined,
    'dryRun must NOT advance the persisted cursor',
  );
  off();
});
