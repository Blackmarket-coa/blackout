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
  secretBox.clearSecretBoxConfigCache();
  const service = await import('../src/services/outboundEventWebhooks');
  const store = await import('../src/db/store');
  store.db.outboundEventWebhooks.clear();
  return { service, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `oe-${id.slice(0, 4)}`,
    email: `oe-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

interface RecordedCall {
  url: string;
  init?: RequestInit;
  body: string;
  headers: Record<string, string>;
}

const buildRecordingFetch = (
  responder: (call: RecordedCall) => Response | Promise<Response>,
): { fetchFn: typeof fetch; calls: RecordedCall[] } => {
  const calls: RecordedCall[] = [];
  const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = String(v);
    const body = String(init?.body ?? '');
    const recorded: RecordedCall = {
      url: typeof url === 'string' ? url : url.toString(),
      init,
      body,
      headers,
    };
    calls.push(recorded);
    return responder(recorded);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
};

test('register: validates URL scheme, name, event types; rejects localhost SSRF target', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);

  const bad: Array<{ patch: Record<string, unknown>; reason: RegExp }> = [
    { patch: { name: '' }, reason: /name is required/ },
    { patch: { name: 'A'.repeat(81) }, reason: /name must be ≤/ },
    { patch: { targetUrl: 'not-a-url' }, reason: /valid URL/ },
    { patch: { targetUrl: 'ftp://x/y' }, reason: /must use http/ },
    { patch: { targetUrl: 'http://localhost/x' }, reason: /non-routable/ },
    { patch: { targetUrl: 'http://192.local/x' }, reason: /non-routable/ },
    {
      patch: { targetUrl: 'https://hooks.discord.com/api/webhooks/x/y', eventTypes: ['nonsense'] },
      reason: /unknown event type/,
    },
  ];
  for (const { patch, reason } of bad) {
    const out = service.register({
      blackoutUserId: user.id,
      name: 'Discord channel',
      targetUrl: 'https://hooks.discord.com/api/webhooks/x/y',
      eventTypes: [],
      ...patch,
    } as Parameters<typeof service.register>[0]);
    assert.equal(out.kind, 'invalid_input');
    if (out.kind === 'invalid_input') assert.match(out.reason, reason);
  }
});

test('register: returns plaintext signing secret only once; persists AES-GCM envelope, not plaintext', async () => {
  const { service, db } = await loadModules();
  const secretBox = await import('../src/services/secretBox');
  const user = await seedUser(db);
  const out = service.register({
    blackoutUserId: user.id,
    name: 'Discord channel',
    targetUrl: 'https://hooks.discord.com/api/webhooks/123/abc',
    eventTypes: ['tip.created'],
  });
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.ok(out.signingSecret.length >= 32);
  const stored = db.getOutboundEventWebhook(out.record.id);
  assert.ok(stored);
  // The stored row is the AES-GCM envelope, not the plaintext or its hash.
  assert.notEqual(stored!.signingSecretCiphertext, out.signingSecret);
  assert.match(stored!.signingSecretCiphertext, /^v1:/);
  assert.equal(stored!.encryptionKeyId, 'v1');
  // It decrypts back to the original plaintext using the row-bound AAD.
  const roundTripped = secretBox.decryptSecret(stored!.signingSecretCiphertext, {
    aad: service.__test__.aadFor(stored!.id),
  });
  assert.equal(roundTripped, out.signingSecret);
  assert.deepEqual(stored!.eventTypes, ['tip.created']);
});

test('register: AAD binds the envelope so it cannot be replayed against a different row', async () => {
  const { service, db } = await loadModules();
  const secretBox = await import('../src/services/secretBox');
  const user = await seedUser(db);
  const a = service.register({
    blackoutUserId: user.id,
    name: 'A',
    targetUrl: 'https://example.com/a',
    eventTypes: [],
  });
  const b = service.register({
    blackoutUserId: user.id,
    name: 'B',
    targetUrl: 'https://example.com/b',
    eventTypes: [],
  });
  if (a.kind !== 'ok' || b.kind !== 'ok') return assert.fail();
  const aRow = db.getOutboundEventWebhook(a.record.id)!;
  // Decrypting A's envelope with B's AAD must fail (GCM tag mismatch).
  assert.throws(() =>
    secretBox.decryptSecret(aRow.signingSecretCiphertext, {
      aad: service.__test__.aadFor(b.record.id),
    }),
  );
});

test('renderEvent: collapses event data into a Discord embed shape with title+color+fields', async () => {
  const { service } = await loadModules();
  const payload = service.renderEvent({
    type: 'tip.created',
    blackoutUserId: 'u1',
    data: { amount: 500, currency: 'USD', from: 'alice' },
    occurredAt: '2026-05-07T12:34:56.000Z',
  });
  assert.equal(payload.username, 'Blackout');
  assert.equal(payload.content, 'New tip');
  assert.ok(payload.embeds && payload.embeds.length === 1);
  const embed = payload.embeds![0];
  assert.equal(embed.title, 'New tip');
  assert.ok(typeof embed.color === 'number');
  assert.equal(embed.timestamp, '2026-05-07T12:34:56.000Z');
  assert.deepEqual(
    embed.fields?.map((f) => `${f.name}=${f.value}`).sort(),
    ['amount=500', 'currency=USD', 'from=alice'],
  );
  assert.equal(embed.footer?.text, 'event: tip.created');
});

test('verifySignature: round-trips computeSignature; rejects tampered body', async () => {
  const { service } = await loadModules();
  const ts = '2026-05-07T00:00:00Z';
  const body = '{"hello":"world"}';
  const sig = service.computeSignature('secret', ts, body);
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
  assert.equal(service.verifySignature('secret', ts, body, sig), true);
  assert.equal(service.verifySignature('secret', ts, body + 'x', sig), false);
  assert.equal(service.verifySignature('wrong-secret', ts, body, sig), false);
});

test('deliverToSubscription: signs the body with the at-rest secret, includes blackout headers, marks delivered', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const created = service.register({
    blackoutUserId: user.id,
    name: 'Zapier',
    targetUrl: 'https://hooks.zapier.com/x/y',
    eventTypes: [],
  });
  if (created.kind !== 'ok') return assert.fail();
  const { fetchFn, calls } = buildRecordingFetch(() => new Response(null, { status: 204 }));
  // Note: we do NOT pass signingSecretOverride. The service unwraps the
  // encrypted-at-rest envelope itself; this is the production path.
  const report = await service.deliverToSubscription(
    created.record,
    {
      type: 'tip.created',
      blackoutUserId: user.id,
      data: { amount: 100 },
      occurredAt: '2026-05-07T12:00:00Z',
    },
    { fetchFn },
  );
  assert.equal(report.ok, true);
  assert.equal(report.status, 204);
  assert.equal(calls.length, 1);

  const call = calls[0];
  assert.equal(call.url, 'https://hooks.zapier.com/x/y');
  assert.ok(call.headers['x-blackout-signature']);
  assert.match(call.headers['x-blackout-signature'], /^sha256=[0-9a-f]{64}$/);
  assert.ok(call.headers['x-blackout-timestamp']);
  assert.equal(call.headers['x-blackout-event-type'], 'tip.created');
  assert.ok(call.headers['x-blackout-delivery-id']);

  // The receiver verifies against the plaintext-secret-they-saved + the
  // (timestamp + '.' + body) we sent.
  const ok = service.verifySignature(
    created.signingSecret,
    call.headers['x-blackout-timestamp'],
    call.body,
    call.headers['x-blackout-signature'],
  );
  assert.equal(ok, true);

  const updated = db.getOutboundEventWebhook(created.record.id);
  assert.equal(updated!.deliveryCount, 1);
  assert.equal(updated!.consecutiveFailures, 0);
  assert.ok(updated!.lastDeliveryAt);
});

test('deliverToSubscription: retries on 5xx but not on 4xx; auto-pauses after 5 consecutive failures', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const created = service.register({
    blackoutUserId: user.id,
    name: 'Flaky',
    targetUrl: 'https://example.com/hook',
    eventTypes: [],
  });
  if (created.kind !== 'ok') return assert.fail();

  // 4xx → no retries
  const r4 = buildRecordingFetch(() => new Response(null, { status: 400 }));
  await service.deliverToSubscription(
    created.record,
    { type: 'tip.created', blackoutUserId: user.id, data: {} },
    { fetchFn: r4.fetchFn },
  );
  assert.equal(r4.calls.length, 1, 'no retry on 4xx');

  // 5xx → 3 attempts
  const fresh = db.getOutboundEventWebhook(created.record.id)!;
  const r5 = buildRecordingFetch(() => new Response(null, { status: 502 }));
  await service.deliverToSubscription(
    fresh,
    { type: 'tip.created', blackoutUserId: user.id, data: {} },
    { fetchFn: r5.fetchFn, timeoutMs: 100 },
  );
  assert.equal(r5.calls.length, 3, 'three attempts on 5xx');

  // After enough consecutive failures the sub auto-pauses.
  for (let i = 0; i < service.__test__.FAILURE_PAUSE_THRESHOLD + 2; i++) {
    const r = db.getOutboundEventWebhook(created.record.id)!;
    if (!r.isActive) break;
    await service.deliverToSubscription(
      r,
      { type: 'tip.created', blackoutUserId: user.id, data: {} },
      { fetchFn: r5.fetchFn, timeoutMs: 100 },
    );
  }
  const after = db.getOutboundEventWebhook(created.record.id)!;
  assert.equal(after.isActive, false);
  assert.ok(after.consecutiveFailures >= service.__test__.FAILURE_PAUSE_THRESHOLD);
});

test('captureTip dispatches tip.created via the outbound webhook pipeline', async () => {
  const { service, db } = await loadModules();
  const tips = await import('../src/services/tips');
  tips.resetTipsForTest();

  const auth = await import('../src/services/auth');
  const recipientId = randomUUID();
  const senderId = randomUUID();
  for (const [id, suffix] of [
    [recipientId, 'r'],
    [senderId, 's'],
  ] as const) {
    db.createUser({
      id,
      username: `t-${suffix}-${id.slice(0, 4)}`,
      email: `t-${suffix}-${id.slice(0, 4)}@example.com`,
      passwordHash: auth.hashPassword('Original-Pass-1234!'),
      reputationScore: 0,
      reputationTier: 'member',
      pubkeyEd25519: 'pk',
    });
  }

  const sub = service.register({
    blackoutUserId: recipientId,
    name: 'Recipient Discord channel',
    targetUrl: 'https://hooks.discord.com/api/webhooks/T/T',
    eventTypes: ['tip.created'],
  });
  if (sub.kind !== 'ok') return assert.fail();

  // Stub fetch globally because tips.ts dispatches the event without a
  // testable fetchFn injection. The dispatch is fire-and-forget, so we
  // also need to wait for the microtask that completes it.
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = (async (url: any, init: any) => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[String(k).toLowerCase()] = String(v);
      }
    }
    calls.push({ url: String(url), headers, body: String(init?.body ?? '') });
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;

  try {
    const created = tips.createTip({
      senderUserId: senderId,
      recipientUserId: recipientId,
      contextKind: 'profile',
      grossCents: 500,
      currency: 'usd',
    });
    tips.captureTip(created.id);

    // The dispatchOutboundEvent call inside captureTip is `void`'d. Give
    // the microtask queue a few chances to flush before we assert.
    for (let i = 0; i < 20 && calls.length === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(calls.length, 1, 'tip.created should fire exactly once');
    assert.equal(calls[0].url, 'https://hooks.discord.com/api/webhooks/T/T');
    assert.match(calls[0].headers['x-blackout-signature'], /^sha256=[0-9a-f]{64}$/);
    assert.equal(calls[0].headers['x-blackout-event-type'], 'tip.created');
    // The receiver verifies with the plaintext they captured at create time.
    assert.equal(
      service.verifySignature(
        sub.signingSecret,
        calls[0].headers['x-blackout-timestamp'],
        calls[0].body,
        calls[0].headers['x-blackout-signature'],
      ),
      true,
    );
    // The body is a Discord-shape execute payload mentioning the tip amount.
    const parsed = JSON.parse(calls[0].body);
    assert.ok(parsed.embeds);
    assert.ok(JSON.stringify(parsed.embeds[0]).includes('500'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('dispatchEvent: filters by eventType subset and ownership; signs with at-rest secret', async () => {
  const { service, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const aliceTip = service.register({
    blackoutUserId: alice.id,
    name: 'A-tip',
    targetUrl: 'https://a.example/tip',
    eventTypes: ['tip.created'],
  });
  service.register({
    blackoutUserId: alice.id,
    name: 'A-stream',
    targetUrl: 'https://a.example/stream',
    eventTypes: ['livestream.started'],
  });
  service.register({
    blackoutUserId: bob.id,
    name: 'B-tip',
    targetUrl: 'https://b.example/tip',
    eventTypes: ['tip.created'],
  });
  if (aliceTip.kind !== 'ok') return assert.fail();

  const recorder = buildRecordingFetch(() => new Response(null, { status: 200 }));
  const reports = await service.dispatchEvent(
    {
      type: 'tip.created',
      blackoutUserId: alice.id,
      data: { amount: 1 },
    },
    { fetchFn: recorder.fetchFn },
  );
  assert.equal(recorder.calls.length, 1, 'only A-tip should fire (not A-stream, not B-tip)');
  assert.equal(recorder.calls[0].url, 'https://a.example/tip');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].ok, true);

  // Receiver verifies the body signature with the plaintext they saved
  // — no per-event interaction with the server is required.
  const ok = service.verifySignature(
    aliceTip.signingSecret,
    recorder.calls[0].headers['x-blackout-timestamp'],
    recorder.calls[0].body,
    recorder.calls[0].headers['x-blackout-signature'],
  );
  assert.equal(ok, true);
});
