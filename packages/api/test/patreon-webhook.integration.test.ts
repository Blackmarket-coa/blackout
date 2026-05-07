import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

const KEY_V1 = randomBytes(32).toString('base64');

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1}`;
process.env.PATREON_WEBHOOK_SECRET = 'patreon-test-secret';

const SECRET = process.env.PATREON_WEBHOOK_SECRET!;

const loadModules = async () => {
  const webhookEvents = await import('../src/integrations/patreon/webhookEvents');
  const route = await import('../src/routes/patreonWebhook');
  const widgetBus = await import('../src/services/widgetBus');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const secretBox = await import('../src/services/secretBox');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  widgetBus.clearAllSubscribersForTest();
  // Test isolation
  store.db.linkedAccounts.clear();
  return { webhookEvents, route, widgetBus, linkedAccounts, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `patreon-${id.slice(0, 4)}`,
    email: `patreon-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

const seedPatreonLink = async (
  blackoutUserId: string,
  patreonCampaignUserId: string,
) => {
  const linkedAccounts = await import('../src/services/linkedAccounts');
  return linkedAccounts.upsertLinkedAccount({
    blackoutUserId,
    provider: 'patreon',
    providerUserId: patreonCampaignUserId,
    providerUsername: 'TestCreator',
    tokens: { accessToken: 'tok', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });
};

const sign = (body: string): string =>
  createHmac('md5', SECRET).update(body).digest('hex');

// =============================================================================
// verifyPatreonWebhook
// =============================================================================

test('verifyPatreonWebhook: ok on a correctly-signed delivery for a supported event', async () => {
  const { webhookEvents } = await loadModules();
  const body = '{"data":{}}';
  const out = webhookEvents.verifyPatreonWebhook({
    headers: {
      'x-patreon-signature': sign(body),
      'x-patreon-event': 'members:pledge:create',
    },
    rawBody: body,
    secret: SECRET,
  });
  assert.equal(out.kind, 'ok');
  if (out.kind === 'ok') assert.equal(out.event, 'members:pledge:create');
});

test('verifyPatreonWebhook: rejects an unsupported event type', async () => {
  const { webhookEvents } = await loadModules();
  const body = '{}';
  const out = webhookEvents.verifyPatreonWebhook({
    headers: {
      'x-patreon-signature': sign(body),
      'x-patreon-event': 'posts:publish',
    },
    rawBody: body,
    secret: SECRET,
  });
  assert.equal(out.kind, 'unsupported_event');
});

test('verifyPatreonWebhook: rejects a tampered body', async () => {
  const { webhookEvents } = await loadModules();
  const body = '{"data":{}}';
  const out = webhookEvents.verifyPatreonWebhook({
    headers: {
      'x-patreon-signature': sign(body),
      'x-patreon-event': 'members:pledge:create',
    },
    rawBody: `${body} /* injected */`,
    secret: SECRET,
  });
  assert.equal(out.kind, 'signature_mismatch');
});

test('verifyPatreonWebhook: missing-headers fast-path returns the missing name', async () => {
  const { webhookEvents } = await loadModules();
  const baseHeaders = {
    'x-patreon-signature': sign('{}'),
    'x-patreon-event': 'members:pledge:create',
  };
  for (const omit of ['x-patreon-signature', 'x-patreon-event']) {
    const headers = { ...baseHeaders };
    delete (headers as Record<string, string | undefined>)[omit];
    const out = webhookEvents.verifyPatreonWebhook({ headers, rawBody: '{}', secret: SECRET });
    assert.equal(out.kind, 'missing_headers', `omit=${omit}`);
    if (out.kind === 'missing_headers') assert.equal(out.missing, omit);
  }
});

// =============================================================================
// normalizePatreonWebhook
// =============================================================================

test('normalizePatreonWebhook (pledge create): extracts amount, patron name, tier title', async () => {
  const { webhookEvents } = await loadModules();
  const out = webhookEvents.normalizePatreonWebhook('members:pledge:create', {
    data: {
      type: 'member',
      id: 'mem-1',
      attributes: {
        currently_entitled_amount_cents: 500,
        full_name: 'Patron Display',
      },
      relationships: {
        user: { data: { type: 'user', id: 'u-1' } },
        campaign: { data: { type: 'campaign', id: 'cam-99' } },
        currently_entitled_tiers: { data: [{ type: 'tier', id: 'tier-A' }] },
      },
    },
    included: [
      { type: 'user', id: 'u-1', attributes: { full_name: 'Alice Patron', vanity: 'alice' } },
      { type: 'tier', id: 'tier-A', attributes: { title: 'Gold' } },
    ],
  });
  assert.ok(out);
  assert.equal(out!.kind, 'patreon_pledge');
  if (out!.kind === 'patreon_pledge') {
    assert.equal(out!.amountCents, 500);
    assert.equal(out!.patronDisplayName, 'Alice Patron');
    assert.equal(out!.tierTitle, 'Gold');
    assert.equal(out!.campaignUserId, 'cam-99');
  }
});

test('normalizePatreonWebhook (delete): returns the canceled variant', async () => {
  const { webhookEvents } = await loadModules();
  const out = webhookEvents.normalizePatreonWebhook('members:pledge:delete', {
    data: {
      type: 'member',
      id: 'mem-2',
      relationships: {
        user: { data: { type: 'user', id: 'u-2' } },
        campaign: { data: { type: 'campaign', id: 'cam-99' } },
      },
    },
    included: [{ type: 'user', id: 'u-2', attributes: { full_name: 'Departing Patron' } }],
  });
  assert.equal(out?.kind, 'patreon_pledge_canceled');
});

test('normalizePatreonWebhook: returns null when there is no campaign relationship to route on', async () => {
  const { webhookEvents } = await loadModules();
  const out = webhookEvents.normalizePatreonWebhook('members:pledge:create', {
    data: { type: 'member', id: 'mem-x', attributes: {}, relationships: {} },
  });
  assert.equal(out, null);
});

// =============================================================================
// route (full HMAC + parse + forward path)
// =============================================================================

const buildRequest = (body: string, headers: Record<string, string>): Request =>
  new Request('http://localhost/', { method: 'POST', body, headers });

test('route: pledge:create webhook → publishes a donation alert into the bridged creator\'s bus', async () => {
  const { route, widgetBus, db } = await loadModules();
  const user = await seedUser(db);
  await seedPatreonLink(user.id, 'cam-99');
  const router = route.buildPatreonWebhookRoute({ secretResolver: () => SECRET });

  const calls: Array<{ type: string; message: Array<Record<string, unknown>> }> = [];
  const off = widgetBus.subscribe(user.id, (event) =>
    calls.push({ type: event.type, message: event.message }),
  );

  const body = JSON.stringify({
    data: {
      type: 'member',
      id: 'mem-1',
      attributes: { currently_entitled_amount_cents: 500 },
      relationships: {
        user: { data: { type: 'user', id: 'u-1' } },
        campaign: { data: { type: 'campaign', id: 'cam-99' } },
      },
    },
    included: [{ type: 'user', id: 'u-1', attributes: { full_name: 'Alice' } }],
  });
  const res = await router.fetch(
    buildRequest(body, {
      'x-patreon-signature': sign(body),
      'x-patreon-event': 'members:pledge:create',
      'content-type': 'application/json',
    }),
  );
  assert.equal(res.status, 200);

  // Give the .then on the publish a microtask to flush.
  await new Promise((r) => setImmediate(r));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'donation');
  // Streamlabs envelope with formatted amount + currency.
  const msg = calls[0].message[0];
  assert.equal(msg.name, 'Alice');
  assert.equal(msg.amount, '5.00');
  assert.equal(msg.formatted_amount, '$5.00');
  assert.equal(msg.currency, 'USD');
  off();
});

test('route: webhook for a campaign with no linked Blackout creator → 200 ack, no publish', async () => {
  const { route, widgetBus, db } = await loadModules();
  const user = await seedUser(db);
  // No seedPatreonLink — orphan webhook.
  const router = route.buildPatreonWebhookRoute({ secretResolver: () => SECRET });

  let calls = 0;
  const off = widgetBus.subscribe(user.id, () => {
    calls += 1;
  });

  const body = JSON.stringify({
    data: {
      type: 'member',
      attributes: { currently_entitled_amount_cents: 100 },
      relationships: {
        user: { data: { type: 'user', id: 'u-1' } },
        campaign: { data: { type: 'campaign', id: 'cam-no-link' } },
      },
    },
    included: [{ type: 'user', id: 'u-1', attributes: { full_name: 'Stranger' } }],
  });
  const res = await router.fetch(
    buildRequest(body, {
      'x-patreon-signature': sign(body),
      'x-patreon-event': 'members:pledge:create',
      'content-type': 'application/json',
    }),
  );
  assert.equal(res.status, 200);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 0, 'no creator linked → no publish');
  off();
});

test('route: forged signature → 403, no publish', async () => {
  const { route, widgetBus, db } = await loadModules();
  const user = await seedUser(db);
  await seedPatreonLink(user.id, 'cam-99');
  const router = route.buildPatreonWebhookRoute({ secretResolver: () => SECRET });

  let calls = 0;
  const off = widgetBus.subscribe(user.id, () => {
    calls += 1;
  });

  const body = '{"data":{}}';
  const res = await router.fetch(
    buildRequest(body, {
      'x-patreon-signature': createHmac('md5', 'attacker-secret').update(body).digest('hex'),
      'x-patreon-event': 'members:pledge:create',
    }),
  );
  assert.equal(res.status, 403);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 0);
  off();
});

test('route: unsupported event type → 200 ack (Patreon should not retry), no publish', async () => {
  const { route, widgetBus, db } = await loadModules();
  const user = await seedUser(db);
  await seedPatreonLink(user.id, 'cam-99');
  const router = route.buildPatreonWebhookRoute({ secretResolver: () => SECRET });
  let calls = 0;
  const off = widgetBus.subscribe(user.id, () => {
    calls += 1;
  });
  const body = '{}';
  const res = await router.fetch(
    buildRequest(body, {
      'x-patreon-signature': sign(body),
      'x-patreon-event': 'posts:publish',
    }),
  );
  assert.equal(res.status, 200);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 0);
  off();
});

test('route: missing PATREON_WEBHOOK_SECRET → 503 (recoverable misconfig, Patreon retries)', async () => {
  const { route } = await loadModules();
  const router = route.buildPatreonWebhookRoute({ secretResolver: () => undefined });
  const body = '{}';
  const res = await router.fetch(
    buildRequest(body, {
      'x-patreon-signature': '00',
      'x-patreon-event': 'members:pledge:create',
    }),
  );
  assert.equal(res.status, 503);
});
