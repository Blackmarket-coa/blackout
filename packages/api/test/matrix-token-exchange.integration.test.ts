/**
 * Coverage for POST /v1/auth/matrix/exchange — the bridge that turns a live
 * Matrix session into a Blackout API JWT so /v1/* features work for users who
 * signed up through the Matrix UI (which never mints a Blackout JWT on its
 * own). See packages/api/src/routes/auth.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
  process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Matrix-Exchange-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { matrixClient } = await import('../src/integrations/matrix-client');
const { verifyJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

type WhoamiResult = Awaited<ReturnType<typeof matrixClient.whoami>>;
const stubWhoami = (result: WhoamiResult) => {
  const original = matrixClient.whoami;
  matrixClient.whoami = async () => result;
  return () => {
    matrixClient.whoami = original;
  };
};

const exchange = (matrixToken: string | null) =>
  app.request('/v1/auth/matrix/exchange', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(matrixToken ? { 'x-matrix-access-token': matrixToken } : {}),
    },
    body: JSON.stringify({}),
  });

test('rejects a request with no Matrix token', async () => {
  const res = await exchange(null);
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'matrix_token_missing');
});

test('rejects an invalid Matrix token', async () => {
  const restore = stubWhoami({ ok: false, status: 401, reason: 'invalid_token' });
  try {
    const res = await exchange('mx_bogus_token');
    assert.equal(res.status, 401);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'matrix_token_invalid');
  } finally {
    restore();
  }
});

test('valid token mints a verifiable Blackout JWT and auto-provisions the user', async () => {
  const localpart = `mx-exchange-${Date.now()}`;
  assert.equal(db.findUserByUsername(localpart), undefined);

  const restore = stubWhoami({
    ok: true,
    status: 200,
    userId: `@${localpart}:theblackout.app`,
    deviceId: 'DEVICE1',
  });
  try {
    const res = await exchange('mx_good_token');
    assert.equal(res.status, 200);
    const body = (await res.json()) as { token: string; userId: string };

    const payload = verifyJwt(body.token);
    assert.ok(payload, 'issued token should verify');
    assert.equal(payload?.username, localpart);
    assert.equal(payload?.sub, body.userId);

    const provisioned = db.findUserByUsername(localpart);
    assert.ok(provisioned, 'user should be auto-provisioned');
    assert.equal(provisioned?.id, body.userId);
  } finally {
    restore();
  }
});

test('a second exchange for the same Matrix user reuses the existing row', async () => {
  const localpart = `mx-reuse-${Date.now()}`;
  const restore = stubWhoami({
    ok: true,
    status: 200,
    userId: `@${localpart}:theblackout.app`,
    deviceId: 'DEVICE1',
  });
  try {
    const first = (await (await exchange('mx_good_token')).json()) as { userId: string };
    const second = (await (await exchange('mx_good_token')).json()) as { userId: string };
    assert.equal(first.userId, second.userId, 'no duplicate user row');
  } finally {
    restore();
  }
});

test('rejects a Matrix user id with an unsupported localpart', async () => {
  const restore = stubWhoami({
    ok: true,
    status: 200,
    userId: '@Bad Localpart!:theblackout.app',
    deviceId: 'DEVICE1',
  });
  try {
    const res = await exchange('mx_good_token');
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'matrix_user_invalid');
  } finally {
    restore();
  }
});
