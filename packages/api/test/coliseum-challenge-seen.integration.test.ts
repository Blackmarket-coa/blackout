/**
 * Who may record that a Coliseum challenge was seen
 * (`POST /v1/coliseum/matches/:id/seen`, the "dodge ping").
 *
 * The status it sets, "Seen, No Response", is public: it says the person
 * challenged saw the Callout and said nothing. Until 2026-10-26 the route took
 * no session, so anyone with the match id, the challenger included, could put
 * that on someone who never opened the link (F9 in
 * docs/security/api-findings-triage-2026-10-25.md). Only the named opponent,
 * signed in, can record it now.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.COLISEUM_MATCH_RATE_LIMIT_MAX = '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

let seq = 0;
const nextId = (label: string) => `${label}-${Date.now()}-${++seq}`;

const auth = (userId: string | null): Record<string, string> => ({
    'content-type': 'application/json',
    ...(userId ? { authorization: `Bearer ${signJwt(userId, 'coliseum', 600)}` } : {}),
});

const callout = async (challenger: string, body: Record<string, unknown>) => {
    const res = await app.request('/v1/coliseum/matches', {
        method: 'POST',
        headers: auth(challenger),
        body: JSON.stringify({ proposition: 'Prove me wrong', ...body }),
    });
    assert.equal(res.status, 201);
    return ((await res.json()) as { match: { id: string } }).match.id;
};

const markSeen = (matchId: string, userId: string | null) =>
    app.request(`/v1/coliseum/matches/${matchId}/seen`, { method: 'POST', headers: auth(userId) });

const status = async (matchId: string) =>
    (
        (await (await app.request(`/v1/coliseum/matches/${matchId}/link`)).json()) as {
            status: string;
        }
    ).status;

const seenAt = (matchId: string) => db.getColiseumMatch(matchId)?.challengeSeenAt;

test('without a session the ping is refused 401 and the challenge stays pending', async () => {
    const target = nextId('target');
    const matchId = await callout(nextId('challenger'), { opponentId: target });
    assert.equal((await markSeen(matchId, null)).status, 401);
    assert.equal(seenAt(matchId), undefined);
    assert.equal(await status(matchId), 'pending');
});

test('the challenger and a bystander are refused 403, and nothing is recorded', async () => {
    const challenger = nextId('challenger');
    const matchId = await callout(challenger, { opponentId: nextId('target') });
    for (const caller of [challenger, nextId('bystander')]) {
        const res = await markSeen(matchId, caller);
        assert.equal(res.status, 403, caller);
        assert.equal(((await res.json()) as { code: string }).code, 'forbidden');
    }
    assert.equal(seenAt(matchId), undefined);
    assert.equal(await status(matchId), 'pending');
});

test('the person challenged records it, once', async () => {
    const target = nextId('target');
    const matchId = await callout(nextId('challenger'), { opponentId: target });

    const res = await markSeen(matchId, target);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'seen' });
    const first = seenAt(matchId);
    assert.ok(first);
    assert.equal(await status(matchId), 'seen');

    assert.equal((await markSeen(matchId, target)).status, 200);
    assert.equal(seenAt(matchId), first);
});

test('an open challenge names nobody, so nobody can mark it seen', async () => {
    const challenger = nextId('challenger');
    const matchId = await callout(challenger, { open: true });
    for (const caller of [challenger, nextId('taker')]) {
        assert.equal((await markSeen(matchId, caller)).status, 403, caller);
    }
    assert.equal(seenAt(matchId), undefined);
    assert.equal(await status(matchId), 'open');
});

test('an unknown match is 404 for a signed-in caller', async () => {
    assert.equal((await markSeen('no-such-match', nextId('someone'))).status, 404);
});
