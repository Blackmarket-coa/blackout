import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.MATRIX_HOMESERVER = process.env.MATRIX_HOMESERVER ?? 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = process.env.MATRIX_BOT_TOKEN ?? 'syt_test_admin_token';

interface FetchCall {
  url: string;
  bodyText?: string;
}
const fetchCalls: FetchCall[] = [];
// Per-test override for what the stubbed Matrix send returns.
let sendOk = true;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const bodyText = init?.body && typeof init.body === 'string' ? init.body : undefined;
  fetchCalls.push({ url, bodyText });
  if (url.includes('/_matrix/client/v3/rooms/') && url.includes('/send/')) {
    return new Response(JSON.stringify(sendOk ? { event_id: '$evt:test' } : { errcode: 'M_UNKNOWN' }), {
      headers: { 'content-type': 'application/json' },
      status: sendOk ? 200 : 500,
    });
  }
  return new Response(JSON.stringify({}), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}) as typeof fetch;

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { runScheduledMessageDispatch } = await import('../src/services/scheduledMessageDispatcher');

const seedUser = () => {
  const id = randomUUID();
  const username = `user-${id.slice(0, 8)}`;
  db.createUser({
    id,
    username,
    email: `${username}@example.com`,
    passwordHash: hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

const bearer = (userId: string, username: string) => ({
  authorization: `Bearer ${signJwt(userId, username, 600)}`,
  'content-type': 'application/json',
});

const futureIso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

test('POST /v1/scheduled-messages stores a pending message for the future', async () => {
  const user = seedUser();
  const res = await app.request('/v1/scheduled-messages', {
    method: 'POST',
    headers: bearer(user.id, user.username),
    body: JSON.stringify({
      matrixRoomId: '!room:test.local',
      body: 'hello later',
      deliverAt: futureIso(60 * 60 * 1000),
    }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { scheduledMessage: { id: string; status: string; userId: string } };
  assert.equal(body.scheduledMessage.status, 'pending');
  assert.equal(body.scheduledMessage.userId, user.id);
});

test('POST /v1/scheduled-messages rejects a deliverAt in the past', async () => {
  const user = seedUser();
  const res = await app.request('/v1/scheduled-messages', {
    method: 'POST',
    headers: bearer(user.id, user.username),
    body: JSON.stringify({
      matrixRoomId: '!room:test.local',
      body: 'too late',
      deliverAt: futureIso(-60 * 1000),
    }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'deliver_at_in_past');
});

test('POST /v1/scheduled-messages requires authentication', async () => {
  const res = await app.request('/v1/scheduled-messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      matrixRoomId: '!room:test.local',
      body: 'no auth',
      deliverAt: futureIso(60 * 1000),
    }),
  });
  assert.equal(res.status, 401);
});

test('GET then DELETE manages a user pending queue', async () => {
  const user = seedUser();
  const create = await app.request('/v1/scheduled-messages', {
    method: 'POST',
    headers: bearer(user.id, user.username),
    body: JSON.stringify({
      matrixRoomId: '!room:test.local',
      body: 'cancel me',
      deliverAt: futureIso(60 * 60 * 1000),
    }),
  });
  const { scheduledMessage } = (await create.json()) as { scheduledMessage: { id: string } };

  const list = await app.request('/v1/scheduled-messages', {
    headers: bearer(user.id, user.username),
  });
  const listBody = (await list.json()) as { scheduledMessages: Array<{ id: string }> };
  assert.ok(listBody.scheduledMessages.some((m) => m.id === scheduledMessage.id));

  const del = await app.request(`/v1/scheduled-messages/${scheduledMessage.id}`, {
    method: 'DELETE',
    headers: bearer(user.id, user.username),
  });
  assert.equal(del.status, 200);

  // Second cancel is a no-op (already cancelled, no longer pending) → 404.
  const delAgain = await app.request(`/v1/scheduled-messages/${scheduledMessage.id}`, {
    method: 'DELETE',
    headers: bearer(user.id, user.username),
  });
  assert.equal(delAgain.status, 404);
});

test('dispatcher delivers a due message to Matrix and marks it delivered', async () => {
  sendOk = true;
  fetchCalls.length = 0;
  const user = seedUser();
  const roomId = `!due-${randomUUID().slice(0, 8)}:test.local`;
  const record = db.createScheduledMessage({
    id: randomUUID(),
    userId: user.id,
    matrixRoomId: roomId,
    body: 'deliver now',
    deliverAt: futureIso(-1000), // already due
  });

  const result = await runScheduledMessageDispatch();
  assert.ok(result.delivered >= 1);

  const sent = fetchCalls.find(
    (call) => call.url.includes(encodeURIComponent(roomId)) && call.url.includes('/send/'),
  );
  assert.ok(sent, 'expected a Matrix send for the due room');
  assert.ok(sent?.bodyText?.includes('deliver now'));

  assert.equal(db.getScheduledMessage(record.id)?.status, 'delivered');
});

test('dispatcher retries a failed send, then marks it failed after max attempts', async () => {
  sendOk = false;
  const user = seedUser();
  const record = db.createScheduledMessage({
    id: randomUUID(),
    userId: user.id,
    matrixRoomId: `!fail-${randomUUID().slice(0, 8)}:test.local`,
    body: 'will fail',
    deliverAt: futureIso(-1000),
  });

  // First failure keeps it pending for a later retry.
  await runScheduledMessageDispatch();
  assert.equal(db.getScheduledMessage(record.id)?.status, 'pending');
  assert.equal(db.getScheduledMessage(record.id)?.attempts, 1);

  // Exhaust the remaining attempts (MAX_ATTEMPTS = 5).
  for (let i = 0; i < 4; i += 1) {
    await runScheduledMessageDispatch();
  }
  assert.equal(db.getScheduledMessage(record.id)?.status, 'failed');
  assert.equal(db.getScheduledMessage(record.id)?.attempts, 5);

  sendOk = true;
});
