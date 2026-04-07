import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET_PRIMARY =
  process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';

const { default: app } = await import('../src/index');

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

test('v1 auth register works', async () => {
  const response = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: `user-${Date.now()}`,
      email: `user-${Date.now()}@example.com`,
      password: 'test-password',
    }),
  });

  assert.equal(response.status, 201);
  const body = await json(response);
  assert.ok(body.token);
  assert.ok(body.userId);
});

test('v1 messages post/list works', async () => {
  const create = await app.request('/v1/messages/general', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'hello', userId: 'demo-user' }),
  });
  assert.equal(create.status, 201);

  const list = await app.request('/v1/messages/general');
  assert.equal(list.status, 200);
  const body = (await list.json()) as Array<{ content: string }>;
  assert.ok(body.some((msg) => msg.content));
});

test('v1 channels create/list works', async () => {
  const create = await app.request('/v1/channels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ communityId: 'c-1', name: 'general' }),
  });
  assert.equal(create.status, 201);

  const list = await app.request('/v1/channels');
  assert.equal(list.status, 200);
  const body = (await list.json()) as Array<{ name: string }>;
  assert.ok(body.some((channel) => channel.name === 'general'));
});

test('v1 governance vote create/get works', async () => {
  const create = await app.request('/v1/governance/votes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      communityId: 'community-1',
      proposerId: 'demo-user',
      title: 'Ship /v1 only',
    }),
  });
  assert.equal(create.status, 201);
  const created = (await create.json()) as { id: string };

  const get = await app.request(`/v1/governance/votes/${created.id}`);
  assert.equal(get.status, 200);
  const body = await json(get);
  assert.equal(body.id, created.id);
});
