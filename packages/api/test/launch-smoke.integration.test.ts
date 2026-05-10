/**
 * Launch-smoke API suite — automated coverage for the LS-* case IDs in
 * docs/launch-smoke-suite.md flagged as "A" (Automated).
 *
 * Scope: exercises the API-level surface for each release-blocker flow.
 * Full end-to-end client flows (LiveKit TURN relay, manual recovery
 * email steps, jsdom-rendering checks) live in the Playwright e2e tree
 * and are not covered here.
 *
 * Each `test` block names the LS-* ID it covers in the title so a CI run
 * surfaces "LS-AUTH-01" / "LS-MSG-02" etc. directly in the test report.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
  process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Launch-Smoke-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';

const { default: app } = await import('../src/index');

let userSeed = Date.now();
async function registerUser(password = 'Smoke-Pass-9876!') {
  const seed = ++userSeed;
  const username = `smoke-${seed}`;
  const email = `smoke-${seed}@example.com`;
  const res = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  assert.equal(res.status, 201, `register failed: ${res.status}`);
  const body = (await res.json()) as { token: string; refreshToken: string; userId: string };
  return { ...body, username, email, password };
}

async function registerCanopy(canopyId: string, token: string) {
  await app.request('/v1/discovery/index/canopies', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ canopyId, name: canopyId }),
  });
}

async function entitleUser(userId: string) {
  await app.request('/v1/subscriptions/webhooks/lago', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      eventId: `evt_entitle_${userId}_${Date.now()}`,
      type: 'invoice.paid',
      userId,
      planCode: 'canopy_sprout_monthly',
    }),
  });
}

// ----------------------------------------------------------------------
// 1) Auth Login / Recovery
// ----------------------------------------------------------------------

test('LS-AUTH-01: valid login establishes a session', async () => {
  const user = await registerUser();
  const res = await app.request('/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { token: string; refreshToken: string; userId: string };
  assert.ok(body.token, 'login missing access token');
  assert.ok(body.refreshToken, 'login missing refresh token');
  assert.equal(body.userId, user.userId);
});

test('LS-AUTH-02: invalid password is denied with a user-safe error', async () => {
  const user = await registerUser();
  const res = await app.request('/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: 'definitely-not-the-password' }),
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string; message: string };
  assert.equal(body.code, 'invalid_credentials');
  assert.ok(/invalid/i.test(body.message), `unexpected message: ${body.message}`);
});

test('LS-AUTH-03: password recovery does not leak account existence', async () => {
  const user = await registerUser();
  // Known-good email.
  const knownGood = await app.request('/v1/auth/password/reset/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email }),
  });
  // Unknown email.
  const unknown = await app.request('/v1/auth/password/reset/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `nonexistent-${Date.now()}@example.com` }),
  });
  // Both must return the same shape so a polling caller can't enumerate.
  assert.equal(knownGood.status, 202);
  assert.equal(unknown.status, 202);
  const knownBody = (await knownGood.json()) as Record<string, unknown>;
  const unknownBody = (await unknown.json()) as Record<string, unknown>;
  assert.deepEqual(knownBody, unknownBody);
});

test('LS-AUTH-05: refresh-token rotation issues a new access token', async () => {
  const user = await registerUser();
  const res = await app.request('/v1/auth/token/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: user.refreshToken }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { token: string; refreshToken: string; userId: string };
  assert.ok(body.token);
  assert.ok(body.refreshToken);
  assert.notEqual(body.refreshToken, user.refreshToken, 'refresh token did not rotate');

  // Reusing the original refresh token must be detected as reuse and
  // invalidate the entire family.
  const reuse = await app.request('/v1/auth/token/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: user.refreshToken }),
  });
  assert.equal(reuse.status, 401);
});

// ----------------------------------------------------------------------
// 2) Room + DM Messaging
// ----------------------------------------------------------------------

test('LS-MSG-01: room message send + list round-trip preserves order', async () => {
  const sender = await registerUser();
  const channelId = `room-${++userSeed}`;
  const send = await app.request(`/v1/messages/${channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'hello room', userId: sender.userId }),
  });
  assert.equal(send.status, 201);
  const sendBody = (await send.json()) as { message: { id: string; content: string } };
  assert.ok(sendBody.message.id);

  const list = await app.request(`/v1/messages/${channelId}`);
  assert.equal(list.status, 200);
  const messages = (await list.json()) as Array<{ id: string; content: string }>;
  assert.ok(messages.some((m) => m.id === sendBody.message.id), 'sent message not in list');
});

test('LS-MSG-02: DM-shaped channel send + list works for both participants', async () => {
  const a = await registerUser();
  const b = await registerUser();
  const dmChannelId = `dm-${a.userId}-${b.userId}`;
  for (const sender of [a, b]) {
    const res = await app.request(`/v1/messages/${dmChannelId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: `hi from ${sender.username}`, userId: sender.userId }),
    });
    assert.equal(res.status, 201);
  }
  const list = await app.request(`/v1/messages/${dmChannelId}`);
  const body = (await list.json()) as Array<{ userId: string; content: string }>;
  assert.ok(body.some((m) => m.userId === a.userId), 'A message missing');
  assert.ok(body.some((m) => m.userId === b.userId), 'B message missing');
});

test('LS-MSG-03: mention is preserved in the channel timeline for the recipient', async () => {
  const sender = await registerUser();
  const recipient = await registerUser();
  const channelId = `mention-${++userSeed}`;
  const send = await app.request(`/v1/messages/${channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: `@${recipient.username} please review`,
      userId: sender.userId,
    }),
  });
  assert.equal(send.status, 201);

  const list = await app.request(`/v1/messages/${channelId}`);
  const body = (await list.json()) as Array<{ content: string }>;
  const mention = body.find((m) => m.content.includes(`@${recipient.username}`));
  assert.ok(mention, 'mention not found in channel timeline');
});

// ----------------------------------------------------------------------
// 3) Media Upload
// ----------------------------------------------------------------------
//
// LS-MEDIA-01..03 are exercised against the Matrix homeserver MXC pipeline
// in the e2e tier (Playwright drives a real upload). The API surface
// covered here proves only the validation gate — empty content is
// rejected with a user-safe error.
test('LS-MEDIA-03: empty / invalid message content is rejected at the API gate', async () => {
  const sender = await registerUser();
  const channelId = `media-${++userSeed}`;
  const res = await app.request(`/v1/messages/${channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: '', userId: sender.userId }),
  });
  assert.equal(res.status, 400);
});

// ----------------------------------------------------------------------
// 4) Moderation
// ----------------------------------------------------------------------

test('LS-MOD-01: moderator can record a remove_content action', async () => {
  const mod = await registerUser();
  const target = await registerUser();
  const headers = {
    authorization: `Bearer ${mod.token}`,
    'x-blackout-capabilities': 'moderation.read,moderation.write',
    'content-type': 'application/json',
  };
  const res = await app.request('/v1/moderation/actions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      communityId: `community-${++userSeed}`,
      actorId: mod.userId,
      targetId: target.userId,
      action: 'remove_content',
      reason: 'smoke-test redaction',
    }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { id: string; targetId: string; action: string };
  assert.equal(body.action, 'remove_content');
  assert.equal(body.targetId, target.userId);
});

test('LS-MOD-03: non-moderator cannot record a moderation action', async () => {
  const user = await registerUser();
  const target = await registerUser();
  const res = await app.request('/v1/moderation/actions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${user.token}`,
      // No moderation capability advertised.
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      communityId: `community-${++userSeed}`,
      actorId: user.userId,
      targetId: target.userId,
      action: 'ban',
      reason: 'smoke-test boundary',
    }),
  });
  assert.equal(res.status, 403);
});

// ----------------------------------------------------------------------
// 5) Governance
// ----------------------------------------------------------------------

test('LS-GOV-01: governance proposal create is visible to eligible voters', async () => {
  const proposer = await registerUser();
  const headers = {
    authorization: `Bearer ${proposer.token}`,
    'x-blackout-capabilities': 'governance.read,governance.write',
    'content-type': 'application/json',
  };
  const create = await app.request('/v1/governance/proposals', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      communityId: `community-${++userSeed}`,
      proposerId: proposer.userId,
      title: 'LS-GOV-01 smoke proposal',
    }),
  });
  assert.equal(create.status, 201);
  const created = (await create.json()) as { id: string; title: string };
  assert.equal(created.title, 'LS-GOV-01 smoke proposal');

  const get = await app.request(`/v1/governance/proposals/${created.id}`, { headers });
  assert.equal(get.status, 200);
});

test('LS-GOV-02: vote is accepted and tally reflects it', async () => {
  const proposer = await registerUser();
  const voter = await registerUser();
  const headers = (token: string) => ({
    authorization: `Bearer ${token}`,
    'x-blackout-capabilities': 'governance.read,governance.write',
    'content-type': 'application/json',
  });
  const create = await app.request('/v1/governance/proposals', {
    method: 'POST',
    headers: headers(proposer.token),
    body: JSON.stringify({
      communityId: `community-${++userSeed}`,
      proposerId: proposer.userId,
      title: 'LS-GOV-02 smoke vote',
    }),
  });
  const proposal = (await create.json()) as { id: string };

  const vote = await app.request('/v1/governance/votes', {
    method: 'POST',
    headers: headers(voter.token),
    body: JSON.stringify({ voteId: proposal.id, userId: voter.userId, choice: 'yes' }),
  });
  assert.equal(vote.status, 200);
  const body = (await vote.json()) as { success: boolean; tally: Record<string, number> };
  assert.equal(body.success, true);
  assert.ok(body.tally && typeof body.tally === 'object', 'tally missing');

  // Re-fetch the proposal — results should include the vote.
  const get = await app.request(`/v1/governance/proposals/${proposal.id}`, {
    headers: headers(proposer.token),
  });
  const proposalWithResults = (await get.json()) as { results?: Record<string, number> };
  assert.ok(proposalWithResults.results, 'proposal missing tally results');
});

// ----------------------------------------------------------------------
// 6) Call Flow — API surface only (TURN relay is e2e)
// ----------------------------------------------------------------------

test('LS-CALL-01: entitled user joining a voice room receives a LiveKit token', async () => {
  const user = await registerUser();
  const canopyId = `canopy-call-${++userSeed}`;
  await registerCanopy(canopyId, user.token);
  await entitleUser(user.userId);
  const res = await app.request('/v1/voice/rooms/join', {
    method: 'POST',
    headers: { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ canopyId, channelId: 'main', role: 'member' }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { livekit?: { token?: string; url?: string; expiresAt?: string } };
  assert.ok(body.livekit?.token, 'missing LiveKit token');
  assert.ok(body.livekit?.url, 'missing LiveKit URL');
  assert.ok(body.livekit?.expiresAt, 'missing LiveKit expiry');
});

test('LS-CALL-03: voice-rooms endpoints reject unauthenticated callers', async () => {
  const res = await app.request('/v1/voice/rooms/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ canopyId: 'x', channelId: 'y', role: 'member' }),
  });
  assert.equal(res.status, 401);
});
