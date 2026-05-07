import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

const KEY_V1 = randomBytes(32).toString('base64');

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1}`;
process.env.MATRIX_APPSERVICE_HS_TOKEN = 'test-hs-token-123';

const HS_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN!;

const loadRoute = async () => {
  const mod = await import('../src/routes/matrixAppservice');
  mod.__test__.resetSeenTxns();
  return mod;
};

test('appservice: missing hs_token env → 503 (operator misconfig; Synapse retries)', async () => {
  const mod = await loadRoute();
  const router = mod.buildMatrixAppserviceRoute({ hsTokenResolver: () => undefined });
  const res = await router.fetch(
    new Request('http://x/transactions/t1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [] }),
    }),
  );
  assert.equal(res.status, 503);
});

test('appservice: bad / missing hs_token → 403 M_FORBIDDEN', async () => {
  const mod = await loadRoute();
  const router = mod.buildMatrixAppserviceRoute({ hsTokenResolver: () => HS_TOKEN });

  const noToken = await router.fetch(
    new Request('http://x/transactions/t1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [] }),
    }),
  );
  assert.equal(noToken.status, 403);

  const wrongToken = await router.fetch(
    new Request('http://x/transactions/t1', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer wrong',
      },
      body: JSON.stringify({ events: [] }),
    }),
  );
  assert.equal(wrongToken.status, 403);
});

test('appservice: accepts hs_token via Authorization header AND ?access_token= query (compat)', async () => {
  const mod = await loadRoute();
  const router = mod.buildMatrixAppserviceRoute({
    hsTokenResolver: () => HS_TOKEN,
    onMessage: () => {},
  });

  const headerOk = await router.fetch(
    new Request('http://x/transactions/t-header', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${HS_TOKEN}`,
      },
      body: JSON.stringify({ events: [] }),
    }),
  );
  assert.equal(headerOk.status, 200);

  const queryOk = await router.fetch(
    new Request(`http://x/transactions/t-query?access_token=${HS_TOKEN}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [] }),
    }),
  );
  assert.equal(queryOk.status, 200);
});

test('appservice: idempotent — replaying a known txnId does NOT re-invoke onMessage', async () => {
  const mod = await loadRoute();
  const calls: Array<{ roomId: string; body: string }> = [];
  const router = mod.buildMatrixAppserviceRoute({
    hsTokenResolver: () => HS_TOKEN,
    onMessage: (roomId, body) => {
      calls.push({ roomId, body });
    },
  });

  const body = JSON.stringify({
    events: [
      {
        type: 'm.room.message',
        room_id: '!den:srv',
        content: { msgtype: 'm.text', body: 'hi all' },
      },
    ],
  });
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${HS_TOKEN}`,
  };
  const make = () =>
    new Request('http://x/transactions/dedupe-1', {
      method: 'PUT',
      headers,
      body,
    });

  const first = await router.fetch(make());
  assert.equal(first.status, 200);
  assert.equal(calls.length, 1);
  const second = await router.fetch(make());
  assert.equal(second.status, 200);
  assert.equal(calls.length, 1, 'replayed txn should not double-deliver');
});

test('appservice: dispatches m.room.message events through onMessage; skips others', async () => {
  const mod = await loadRoute();
  const calls: Array<{ roomId: string; body: string }> = [];
  const router = mod.buildMatrixAppserviceRoute({
    hsTokenResolver: () => HS_TOKEN,
    onMessage: (roomId, body) => {
      calls.push({ roomId, body });
    },
  });
  const res = await router.fetch(
    new Request('http://x/transactions/mixed-1', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${HS_TOKEN}`,
      },
      body: JSON.stringify({
        events: [
          {
            type: 'm.room.message',
            room_id: '!a:srv',
            content: { msgtype: 'm.text', body: 'first' },
          },
          // Non-text msgtype skipped by shouldRouteOutbound.
          {
            type: 'm.room.message',
            room_id: '!a:srv',
            content: { msgtype: 'm.image', url: 'mxc://...' },
          },
          // Origin-tagged ingress event must NOT echo back.
          {
            type: 'm.room.message',
            room_id: '!a:srv',
            content: {
              msgtype: 'm.text',
              body: 'echo from twitch ingress',
              'm.blackout.origin': 'twitch',
            },
          },
          // Member event ignored.
          { type: 'm.room.member', room_id: '!a:srv', content: { membership: 'join' } },
          // Empty body skipped.
          {
            type: 'm.room.message',
            room_id: '!a:srv',
            content: { msgtype: 'm.text', body: '' },
          },
          // Second valid m.text fans out.
          {
            type: 'm.room.message',
            room_id: '!b:srv',
            content: { msgtype: 'm.text', body: 'second' },
          },
        ],
      }),
    }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(
    calls,
    [
      { roomId: '!a:srv', body: 'first' },
      { roomId: '!b:srv', body: 'second' },
    ],
    'only m.text events without origin tag fan out',
  );
});

test('appservice: malformed JSON body → 400 M_NOT_JSON; misshapen events array tolerated', async () => {
  const mod = await loadRoute();
  const router = mod.buildMatrixAppserviceRoute({
    hsTokenResolver: () => HS_TOKEN,
    onMessage: () => {},
  });
  const bad = await router.fetch(
    new Request('http://x/transactions/t-bad', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${HS_TOKEN}`,
      },
      body: '{not valid json',
    }),
  );
  assert.equal(bad.status, 400);

  // events is not an array → treat as zero events; 200 ack.
  const okIsh = await router.fetch(
    new Request('http://x/transactions/t-no-events', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${HS_TOKEN}`,
      },
      body: JSON.stringify({ events: 'not-an-array' }),
    }),
  );
  assert.equal(okIsh.status, 200);
});

test('appservice: handler error in onMessage is swallowed; transaction still acks 200', async () => {
  const mod = await loadRoute();
  let calls = 0;
  const router = mod.buildMatrixAppserviceRoute({
    hsTokenResolver: () => HS_TOKEN,
    onMessage: () => {
      calls += 1;
      throw new Error('downstream blew up');
    },
  });
  const res = await router.fetch(
    new Request('http://x/transactions/t-throw', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${HS_TOKEN}`,
      },
      body: JSON.stringify({
        events: [
          {
            type: 'm.room.message',
            room_id: '!r:srv',
            content: { msgtype: 'm.text', body: 'oops' },
          },
        ],
      }),
    }),
  );
  // 200 so Synapse doesn't retry on a downstream issue we already
  // logged. Otherwise a flaky bridge would cause every message to
  // re-deliver indefinitely.
  assert.equal(res.status, 200);
  assert.equal(calls, 1);
});
