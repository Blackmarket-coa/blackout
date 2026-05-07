import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
// secretBox env not strictly required for these tests; set so any module
// import that touches it still works.
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64')}`;

const SECRET = 'eventsub-test-secret-256bit-or-whatever';

const loadModules = async () => {
  const eventSub = await import('../src/integrations/twitch/eventSub');
  const route = await import('../src/routes/twitchEventSub');
  return { eventSub, route };
};

const sign = (
  messageId: string,
  messageTimestamp: string,
  rawBody: string,
  secret = SECRET,
): string => {
  const h = createHmac('sha256', secret)
    .update(messageId)
    .update(messageTimestamp)
    .update(rawBody)
    .digest('hex');
  return `sha256=${h}`;
};

// =============================================================================
// verifyEventSubMessage
// =============================================================================

test('verifyEventSubMessage: ok on a fresh, signed delivery', async () => {
  const { eventSub } = await loadModules();
  const messageId = 'mid-1';
  const ts = new Date().toISOString();
  const body = '{"subscription":{"type":"channel.follow"},"event":{}}';
  const headers = {
    'twitch-eventsub-message-id': messageId,
    'twitch-eventsub-message-timestamp': ts,
    'twitch-eventsub-message-signature': sign(messageId, ts, body),
    'twitch-eventsub-message-type': 'notification',
    'twitch-eventsub-subscription-type': 'channel.follow',
  };
  const out = eventSub.verifyEventSubMessage({ headers, rawBody: body, secret: SECRET });
  assert.equal(out.kind, 'ok');
});

test('verifyEventSubMessage: rejects a tampered body', async () => {
  const { eventSub } = await loadModules();
  const messageId = 'mid-2';
  const ts = new Date().toISOString();
  const body = '{"subscription":{"type":"channel.follow"}}';
  const headers = {
    'twitch-eventsub-message-id': messageId,
    'twitch-eventsub-message-timestamp': ts,
    'twitch-eventsub-message-signature': sign(messageId, ts, body),
    'twitch-eventsub-message-type': 'notification',
  };
  const out = eventSub.verifyEventSubMessage({
    headers,
    rawBody: body + ' /* injected */',
    secret: SECRET,
  });
  assert.equal(out.kind, 'signature_mismatch');
});

test('verifyEventSubMessage: rejects deliveries older than the 10-minute replay window', async () => {
  const { eventSub } = await loadModules();
  const messageId = 'mid-3';
  // 11 minutes in the past.
  const ts = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  const body = '{}';
  const headers = {
    'twitch-eventsub-message-id': messageId,
    'twitch-eventsub-message-timestamp': ts,
    'twitch-eventsub-message-signature': sign(messageId, ts, body),
    'twitch-eventsub-message-type': 'notification',
  };
  const out = eventSub.verifyEventSubMessage({ headers, rawBody: body, secret: SECRET });
  assert.equal(out.kind, 'replay_rejected');
});

test('verifyEventSubMessage: rejects deliveries from the far future too', async () => {
  const { eventSub } = await loadModules();
  const messageId = 'mid-future';
  const ts = new Date(Date.now() + 11 * 60 * 1000).toISOString();
  const body = '{}';
  const headers = {
    'twitch-eventsub-message-id': messageId,
    'twitch-eventsub-message-timestamp': ts,
    'twitch-eventsub-message-signature': sign(messageId, ts, body),
    'twitch-eventsub-message-type': 'notification',
  };
  const out = eventSub.verifyEventSubMessage({ headers, rawBody: body, secret: SECRET });
  assert.equal(out.kind, 'replay_rejected');
});

test('verifyEventSubMessage: missing-headers fast-paths to a typed error per header', async () => {
  const { eventSub } = await loadModules();
  const baseHeaders = {
    'twitch-eventsub-message-id': 'm',
    'twitch-eventsub-message-timestamp': new Date().toISOString(),
    'twitch-eventsub-message-signature': 'sha256=00',
    'twitch-eventsub-message-type': 'notification',
  };
  for (const omit of [
    'twitch-eventsub-message-id',
    'twitch-eventsub-message-timestamp',
    'twitch-eventsub-message-signature',
    'twitch-eventsub-message-type',
  ]) {
    const headers = { ...baseHeaders };
    delete (headers as Record<string, string | undefined>)[omit];
    const out = eventSub.verifyEventSubMessage({ headers, rawBody: '{}', secret: SECRET });
    assert.equal(out.kind, 'missing_headers', `omit=${omit}`);
    if (out.kind === 'missing_headers') assert.equal(out.missing, omit);
  }
});

test('verifyEventSubMessage: rejects unknown message types', async () => {
  const { eventSub } = await loadModules();
  const messageId = 'mid';
  const ts = new Date().toISOString();
  const body = '{}';
  const headers = {
    'twitch-eventsub-message-id': messageId,
    'twitch-eventsub-message-timestamp': ts,
    'twitch-eventsub-message-signature': sign(messageId, ts, body),
    'twitch-eventsub-message-type': 'whatever_new_type',
  };
  const out = eventSub.verifyEventSubMessage({ headers, rawBody: body, secret: SECRET });
  assert.equal(out.kind, 'unknown_message_type');
});

// =============================================================================
// normalizeEventSub
// =============================================================================

test('normalizeEventSub: channel.follow', async () => {
  const { eventSub } = await loadModules();
  const out = eventSub.normalizeEventSub({
    subscription: {
      id: 'sub-1',
      type: 'channel.follow',
      version: '2',
      status: 'enabled',
      cost: 0,
      condition: { broadcaster_user_id: '42' },
      created_at: '2026-01-01T00:00:00Z',
    },
    event: {
      user_id: '99',
      user_login: 'follower',
      user_name: 'Follower',
      broadcaster_user_id: '42',
      broadcaster_user_login: 'streamer',
      broadcaster_user_name: 'Streamer',
      followed_at: '2026-05-01T00:00:00Z',
    },
  });
  assert.deepEqual(out, {
    kind: 'follow',
    subscriptionType: 'channel.follow',
    twitchChannelId: '42',
    followerLogin: 'follower',
    followerDisplayName: 'Follower',
    followerTwitchId: '99',
    followedAt: '2026-05-01T00:00:00Z',
  });
});

test('normalizeEventSub: channel.subscribe', async () => {
  const { eventSub } = await loadModules();
  const out = eventSub.normalizeEventSub({
    subscription: {
      id: 's',
      type: 'channel.subscribe',
      version: '1',
      status: 'enabled',
      cost: 0,
      condition: {},
      created_at: '2026-01-01T00:00:00Z',
    },
    event: {
      user_id: '7',
      user_login: 'subbed',
      user_name: 'Subbed',
      broadcaster_user_id: '42',
      tier: '2000',
      is_gift: false,
    },
  });
  assert.equal(out?.kind, 'subscribe');
  if (out?.kind === 'subscribe') {
    assert.equal(out.tier, '2000');
    assert.equal(out.isGift, false);
  }
});

test('normalizeEventSub: channel.subscription.gift carries totals + anonymity', async () => {
  const { eventSub } = await loadModules();
  const out = eventSub.normalizeEventSub({
    subscription: {
      id: 's',
      type: 'channel.subscription.gift',
      version: '1',
      status: 'enabled',
      cost: 0,
      condition: {},
      created_at: '2026-01-01T00:00:00Z',
    },
    event: {
      user_id: '101',
      user_login: 'generous',
      user_name: 'Generous',
      broadcaster_user_id: '42',
      total: 5,
      tier: '1000',
      cumulative_total: 27,
      is_anonymous: false,
    },
  });
  assert.equal(out?.kind, 'subscription_gift');
  if (out?.kind === 'subscription_gift') {
    assert.equal(out.total, 5);
    assert.equal(out.cumulativeTotal, 27);
    assert.equal(out.tier, '1000');
    assert.equal(out.isAnonymous, false);
  }
});

test('normalizeEventSub: channel.cheer', async () => {
  const { eventSub } = await loadModules();
  const out = eventSub.normalizeEventSub({
    subscription: {
      id: 's',
      type: 'channel.cheer',
      version: '1',
      status: 'enabled',
      cost: 0,
      condition: {},
      created_at: '2026-01-01T00:00:00Z',
    },
    event: {
      user_id: '8',
      user_login: 'cheerer',
      user_name: 'Cheerer',
      broadcaster_user_id: '42',
      bits: 500,
      message: 'Cheer500 cool!',
      is_anonymous: false,
    },
  });
  assert.equal(out?.kind, 'cheer');
  if (out?.kind === 'cheer') {
    assert.equal(out.bits, 500);
    assert.equal(out.message, 'Cheer500 cool!');
  }
});

test('normalizeEventSub: channel.raid', async () => {
  const { eventSub } = await loadModules();
  const out = eventSub.normalizeEventSub({
    subscription: {
      id: 's',
      type: 'channel.raid',
      version: '1',
      status: 'enabled',
      cost: 0,
      condition: {},
      created_at: '2026-01-01T00:00:00Z',
    },
    event: {
      from_broadcaster_user_id: '11',
      from_broadcaster_user_login: 'raider',
      from_broadcaster_user_name: 'Raider',
      to_broadcaster_user_id: '42',
      viewers: 250,
    },
  });
  assert.equal(out?.kind, 'raid');
  if (out?.kind === 'raid') {
    assert.equal(out.viewers, 250);
    assert.equal(out.fromChannelLogin, 'raider');
  }
});

test('normalizeEventSub: returns null for unknown subscription types', async () => {
  const { eventSub } = await loadModules();
  const out = eventSub.normalizeEventSub({
    subscription: {
      id: 's',
      type: 'channel.imaginary_event',
      version: '1',
      status: 'enabled',
      cost: 0,
      condition: {},
      created_at: '2026-01-01T00:00:00Z',
    },
    event: {},
  });
  assert.equal(out, null);
});

// =============================================================================
// HTTP route
// =============================================================================

const buildRequest = (init: { body: string; headers: Record<string, string> }): Request =>
  new Request('http://localhost/', { method: 'POST', body: init.body, headers: init.headers });

test('eventsub route: webhook_callback_verification echoes the challenge as plaintext', async () => {
  const { route } = await loadModules();
  const router = route.buildTwitchEventSubRoute({ secretResolver: () => SECRET });
  const messageId = 'verify-1';
  const ts = new Date().toISOString();
  const body = JSON.stringify({
    subscription: { id: 's', type: 'channel.follow', status: 'webhook_callback_verification_pending' },
    challenge: 'pq9hPZRZ2YEt3Wd5zCwSn',
  });
  const req = buildRequest({
    body,
    headers: {
      'twitch-eventsub-message-id': messageId,
      'twitch-eventsub-message-timestamp': ts,
      'twitch-eventsub-message-signature': sign(messageId, ts, body),
      'twitch-eventsub-message-type': 'webhook_callback_verification',
      'twitch-eventsub-subscription-type': 'channel.follow',
      'content-type': 'application/json',
    },
  });
  const res = await router.fetch(req);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'pq9hPZRZ2YEt3Wd5zCwSn');
});

test('eventsub route: notification dispatches to onEvent and acks 200', async () => {
  const { route } = await loadModules();
  const received: import('../src/integrations/twitch/eventSub').NormalizedTwitchEvent[] = [];
  const router = route.buildTwitchEventSubRoute({
    secretResolver: () => SECRET,
    onEvent: (event) => {
      received.push(event);
    },
  });
  const messageId = 'notify-1';
  const ts = new Date().toISOString();
  const body = JSON.stringify({
    subscription: {
      id: 's',
      type: 'channel.follow',
      version: '2',
      status: 'enabled',
      cost: 0,
      condition: { broadcaster_user_id: '42' },
      created_at: '2026-01-01T00:00:00Z',
    },
    event: {
      user_id: '99',
      user_login: 'follower',
      user_name: 'Follower',
      broadcaster_user_id: '42',
      followed_at: '2026-05-01T00:00:00Z',
    },
  });
  const req = buildRequest({
    body,
    headers: {
      'twitch-eventsub-message-id': messageId,
      'twitch-eventsub-message-timestamp': ts,
      'twitch-eventsub-message-signature': sign(messageId, ts, body),
      'twitch-eventsub-message-type': 'notification',
      'twitch-eventsub-subscription-type': 'channel.follow',
      'content-type': 'application/json',
    },
  });
  const res = await router.fetch(req);
  assert.equal(res.status, 200);
  assert.equal(received.length, 1);
  assert.equal(received[0].kind, 'follow');
});

test('eventsub route: forged signature → 403, NEVER calls onEvent', async () => {
  const { route } = await loadModules();
  let called = 0;
  const router = route.buildTwitchEventSubRoute({
    secretResolver: () => SECRET,
    onEvent: () => {
      called += 1;
    },
  });
  const messageId = 'forged';
  const ts = new Date().toISOString();
  const body = JSON.stringify({ subscription: { id: 's', type: 'channel.follow' }, event: {} });
  const req = buildRequest({
    body,
    headers: {
      'twitch-eventsub-message-id': messageId,
      'twitch-eventsub-message-timestamp': ts,
      // Sign with the WRONG secret.
      'twitch-eventsub-message-signature': sign(messageId, ts, body, 'attacker-secret'),
      'twitch-eventsub-message-type': 'notification',
      'twitch-eventsub-subscription-type': 'channel.follow',
      'content-type': 'application/json',
    },
  });
  const res = await router.fetch(req);
  assert.equal(res.status, 403);
  assert.equal(called, 0);
});

test('eventsub route: missing secret → 503 so Twitch retries (recoverable misconfig)', async () => {
  const { route } = await loadModules();
  const router = route.buildTwitchEventSubRoute({ secretResolver: () => undefined });
  const messageId = 'no-secret';
  const ts = new Date().toISOString();
  const body = '{}';
  const req = buildRequest({
    body,
    headers: {
      'twitch-eventsub-message-id': messageId,
      'twitch-eventsub-message-timestamp': ts,
      'twitch-eventsub-message-signature': 'sha256=00',
      'twitch-eventsub-message-type': 'notification',
      'twitch-eventsub-subscription-type': 'channel.follow',
      'content-type': 'application/json',
    },
  });
  const res = await router.fetch(req);
  assert.equal(res.status, 503);
});

test('eventsub route: revocation acks with 200 and does NOT call onEvent', async () => {
  const { route } = await loadModules();
  let called = 0;
  const router = route.buildTwitchEventSubRoute({
    secretResolver: () => SECRET,
    onEvent: () => {
      called += 1;
    },
  });
  const messageId = 'rev-1';
  const ts = new Date().toISOString();
  const body = JSON.stringify({
    subscription: { id: 'sub-x', type: 'channel.follow', status: 'authorization_revoked' },
  });
  const req = buildRequest({
    body,
    headers: {
      'twitch-eventsub-message-id': messageId,
      'twitch-eventsub-message-timestamp': ts,
      'twitch-eventsub-message-signature': sign(messageId, ts, body),
      'twitch-eventsub-message-type': 'revocation',
      'twitch-eventsub-subscription-type': 'channel.follow',
      'content-type': 'application/json',
    },
  });
  const res = await router.fetch(req);
  assert.equal(res.status, 200);
  assert.equal(called, 0);
});
