import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_API_SKIP_LISTEN = process.env.BLACKOUT_API_SKIP_LISTEN ?? '1';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.COLISEUM_TOPIC_RATE_LIMIT_MAX = process.env.COLISEUM_TOPIC_RATE_LIMIT_MAX ?? '500';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');

function authHeader(userId: string = 'entry-den-user'): Record<string, string> {
    return { authorization: `Bearer ${signJwt(userId, 'coliseum', 600)}` };
}

/** A challenge with one entry on it, returning the entry's id. */
async function createEntry(title: string, body?: string): Promise<string> {
    const challengeRes = await app.request('/v1/coliseum/challenges', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ title: `Challenge for ${title}`, category: 'food' }),
    });
    assert.equal(challengeRes.status, 201);
    const { challenge } = (await challengeRes.json()) as { challenge: { id: string } };

    const entryRes = await app.request(`/v1/coliseum/challenges/${challenge.id}/entries`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify(body ? { title, body } : { title }),
    });
    assert.equal(entryRes.status, 201);
    const { entry } = (await entryRes.json()) as { entry: { id: string } };
    return entry.id;
}

const link = (entryId: string, denRoomId: string, userId = 'entry-den-user') =>
    app.request(`/v1/coliseum/challenges/entries/${entryId}/den`, {
        method: 'POST',
        headers: authHeader(userId),
        body: JSON.stringify({ denRoomId }),
    });

test('an entry starts with no discussion den — creation is lazy', async () => {
    const entryId = await createEntry('Lazy den entry');
    const response = await link(entryId, '!first:server');
    const body = (await response.json()) as { entry: { discussionDenId: string } };
    // The entry had no den until this call minted one; nothing eagerly creates
    // a Matrix room per entry.
    assert.equal(response.status, 201);
    assert.equal(body.entry.discussionDenId, '!first:server');
});

test('the entry body submitted with an entry round-trips', async () => {
    // `body` has always been in the schema and stored, but the composer never
    // sent it and the card never rendered it, so entries were bare titles.
    const entryId = await createEntry('Entry with prose', 'Here is how I did it.');
    const response = await link(entryId, '!prose:server');
    const { entry } = (await response.json()) as { entry: { body?: string } };
    assert.equal(entry.body, 'Here is how I did it.');
});

/**
 * The den is created client-side, so two people commenting at the same moment
 * can each mint a room. The first link is authoritative; the loser is told so
 * and abandons the room it just made, rather than the entry ending up with two
 * rival discussions.
 */
test('first writer wins when two commenters race', async () => {
    const entryId = await createEntry('Racing commenters');

    const first = await link(entryId, '!alice-den:server', 'alice');
    assert.equal(first.status, 201);

    const second = await link(entryId, '!bob-den:server', 'bob');
    assert.equal(second.status, 200);
    const body = (await second.json()) as {
        entry: { discussionDenId: string };
        created: boolean;
    };
    assert.equal(body.created, false);
    assert.equal(body.entry.discussionDenId, '!alice-den:server');
});

test('the winning den survives a re-read of the challenge', async () => {
    const challengeRes = await app.request('/v1/coliseum/challenges', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ title: 'Persisted den challenge', category: 'food' }),
    });
    const { challenge } = (await challengeRes.json()) as { challenge: { id: string } };
    const entryRes = await app.request(`/v1/coliseum/challenges/${challenge.id}/entries`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ title: 'Persisted entry' }),
    });
    const { entry } = (await entryRes.json()) as { entry: { id: string } };

    await link(entry.id, '!persisted:server');

    // The ranked-entries view is what the client actually renders, so the den
    // has to survive the rank/vote projection, not just the write.
    const reread = await app.request(`/v1/coliseum/challenges/${challenge.id}`, {
        headers: authHeader(),
    });
    const { entries } = (await reread.json()) as {
        entries: { id: string; discussionDenId?: string }[];
    };
    const found = entries.find((candidate) => candidate.id === entry.id);
    assert.equal(found?.discussionDenId, '!persisted:server');
});

test('re-linking the same den is idempotent, not an error', async () => {
    const entryId = await createEntry('Idempotent link');
    await link(entryId, '!same-den:server');
    const again = await link(entryId, '!same-den:server');
    assert.equal(again.status, 200);
    const body = (await again.json()) as { created: boolean };
    assert.equal(body.created, false);
});

test('linking requires auth and a real entry', async () => {
    const entryId = await createEntry('Guarded');

    const noAuth = await app.request(`/v1/coliseum/challenges/entries/${entryId}/den`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ denRoomId: '!x:server' }),
    });
    assert.equal(noAuth.status, 401);

    const missing = await link('cent_does_not_exist', '!x:server');
    assert.equal(missing.status, 404);
});

test('a blank den id is rejected', async () => {
    const entryId = await createEntry('Blank den');
    const response = await link(entryId, '');
    assert.equal(response.status, 400);
});
