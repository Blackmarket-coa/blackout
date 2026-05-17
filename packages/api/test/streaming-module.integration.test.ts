import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
  process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');

async function issueToken(): Promise<string> {
  const suffix = Date.now();
  const response = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: `stream-user-${suffix}`,
      email: `stream-user-${suffix}@example.com`,
      password: 'test-password',
    }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: string };
  return body.token;
}

test('streaming module provisions keys, stream metadata, access policy, sessions and moderation controls', async () => {
  const token = await issueToken();
  const creatorId = `creator-${Date.now()}`;
  const streamId = `stream-${Date.now()}`;
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-blackout-capabilities': 'streaming.read,streaming.write,moderation.read',
  };

  const streamKeyResp = await app.request(`/v1/streaming/creators/${creatorId}/stream-key`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ streamId }),
  });
  assert.equal(streamKeyResp.status, 201);

  const metadataResp = await app.request(`/v1/streaming/streams/${streamId}/metadata`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ creatorId, title: 'Night market live', category: 'shopping', tags: ['drops', 'night'], latencyProfile: 'low' }),
  });
  assert.equal(metadataResp.status, 200);

  const accessResp = await app.request(`/v1/streaming/streams/${streamId}/access`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ creatorId, visibility: 'member_only', allowedSubscriberIds: ['sub-1'] }),
  });
  assert.equal(accessResp.status, 200);

  const sessionStartResp = await app.request(`/v1/streaming/streams/${streamId}/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ creatorId, replayPointer: 'ipfs://replay-1' }),
  });
  assert.equal(sessionStartResp.status, 201);
  const session = (await sessionStartResp.json()) as { id: string };

  const sessionEndResp = await app.request(`/v1/streaming/streams/${streamId}/sessions/${session.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ replayPointer: 'ipfs://replay-final' }),
  });
  assert.equal(sessionEndResp.status, 200);

  const moderationResp = await app.request(`/v1/streaming/streams/${streamId}/moderation`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ slowModeSeconds: 15, bannedUserIds: ['user-1'], keywordFilters: ['scam'] }),
  });
  assert.equal(moderationResp.status, 200);

  const accessReadResp = await app.request(`/v1/streaming/streams/${streamId}/access?subscriberId=sub-1`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'x-blackout-capabilities': 'streaming.read',
    },
  });
  assert.equal(accessReadResp.status, 200);
  const accessBody = (await accessReadResp.json()) as { canAccess: boolean };
  assert.equal(accessBody.canAccess, true);
});

test('PUT /streams/:id/metadata round-trips denId; null clears it', async () => {
  const token = await issueToken();
  const creatorId = `creator-den-${Date.now()}`;
  const streamId = `stream-den-${Date.now()}`;
  const denId = '!den-room:blackout.coop';
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-blackout-capabilities': 'streaming.read,streaming.write',
  };

  const provision = await app.request(`/v1/streaming/creators/${creatorId}/stream-key`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ streamId }),
  });
  assert.equal(provision.status, 201);

  const setMetadata = await app.request(`/v1/streaming/streams/${streamId}/metadata`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ creatorId, title: 'Den-bound', denId }),
  });
  assert.equal(setMetadata.status, 200);
  const withDen = (await setMetadata.json()) as { denId?: string };
  assert.equal(withDen.denId, denId);

  // Visibility must be public for the unauthenticated-style GET to return the record.
  await app.request(`/v1/streaming/streams/${streamId}/access`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ creatorId, visibility: 'public' }),
  });

  const getResp = await app.request(`/v1/streaming/streams/${streamId}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}`, 'x-blackout-capabilities': 'streaming.read' },
  });
  assert.equal(getResp.status, 200);
  const fetched = (await getResp.json()) as { denId?: string };
  assert.equal(fetched.denId, denId);

  // Omitting denId on subsequent metadata writes must not clear it.
  const keepDen = await app.request(`/v1/streaming/streams/${streamId}/metadata`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ creatorId, title: 'Den-bound v2' }),
  });
  assert.equal(keepDen.status, 200);
  const kept = (await keepDen.json()) as { denId?: string };
  assert.equal(kept.denId, denId);

  // Explicit `null` clears the association.
  const clearDen = await app.request(`/v1/streaming/streams/${streamId}/metadata`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ creatorId, title: 'Den-bound v3', denId: null }),
  });
  assert.equal(clearDen.status, 200);
  const cleared = (await clearDen.json()) as { denId?: string | null };
  assert.equal(cleared.denId, undefined);
});
