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

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

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

const follow = (from: { id: string; username: string }, toId: string) =>
    app.request('/v1/circle', {
        method: 'POST',
        headers: bearer(from.id, from.username),
        body: JSON.stringify({ followeeId: toId }),
    });

test('circle: following builds your circle, and it survives on the store', async () => {
    const a = seedUser();
    const b = seedUser();

    const res = await follow(a, b.id);
    assert.equal(res.status, 201);

    // The edge is a real row, not a module-level Map entry — the whole point of
    // migration 085.
    assert.ok(db.getCircleEdge(a.id, b.id), 'edge is persisted on the store');

    const listed = await app.request('/v1/circle/following', {
        headers: bearer(a.id, a.username),
    });
    const body = (await listed.json()) as { following: { userId: string }[] };
    assert.deepEqual(
        body.following.map((u) => u.userId),
        [b.id]
    );
});

test('circle: circles overlap only when both people follow each other', async () => {
    const a = seedUser();
    const b = seedUser();

    const oneWay = await follow(a, b.id);
    assert.equal(
        ((await oneWay.json()) as { overlaps: boolean }).overlaps,
        false,
        'a following b is not yet an overlap'
    );

    // b following back closes the loop from b's side.
    const backAgain = await follow(b, a.id);
    assert.equal(
        ((await backAgain.json()) as { overlaps: boolean }).overlaps,
        true,
        'following back makes the circles overlap'
    );

    // ...and the overlap is visible from a's side too, because it is derived
    // from the two edges rather than stored once.
    const status = await app.request(`/v1/circle/status/${b.id}`, {
        headers: bearer(a.id, a.username),
    });
    assert.deepEqual(await status.json(), {
        isFollowing: true,
        isFollowedBy: true,
        overlaps: true,
    });

    const mutuals = await app.request('/v1/circle/mutuals', {
        headers: bearer(a.id, a.username),
    });
    const mutualBody = (await mutuals.json()) as { mutuals: { userId: string }[] };
    assert.deepEqual(
        mutualBody.mutuals.map((u) => u.userId),
        [b.id]
    );
});

test('circle: unfollowing removes the edge and ends the overlap', async () => {
    const a = seedUser();
    const b = seedUser();
    await follow(a, b.id);
    await follow(b, a.id);

    const removed = await app.request(`/v1/circle/${b.id}`, {
        method: 'DELETE',
        headers: bearer(a.id, a.username),
    });
    assert.deepEqual(await removed.json(), { ok: true, following: false, removed: true });

    // b still holds a in *their* circle — unfollowing is one-directional, which
    // is what makes "circles overlap" a derived fact rather than a shared row.
    assert.equal(db.getCircleEdge(a.id, b.id), undefined);
    assert.ok(db.getCircleEdge(b.id, a.id), "b's edge is untouched");

    const status = await app.request(`/v1/circle/status/${b.id}`, {
        headers: bearer(a.id, a.username),
    });
    assert.deepEqual(await status.json(), {
        isFollowing: false,
        isFollowedBy: true,
        overlaps: false,
    });
});

test('circle: /v1/follows is the same router, so old clients keep working', async () => {
    const a = seedUser();
    const b = seedUser();

    await app.request('/v1/follows', {
        method: 'POST',
        headers: bearer(a.id, a.username),
        body: JSON.stringify({ followeeId: b.id }),
    });

    // Written through the legacy path, read back through the new one.
    const listed = await app.request('/v1/circle/following', {
        headers: bearer(a.id, a.username),
    });
    const body = (await listed.json()) as { following: { userId: string }[] };
    assert.deepEqual(
        body.following.map((u) => u.userId),
        [b.id]
    );
});

test('circle: a brand-new account is honestly unlit', async () => {
    const solo = seedUser();
    const res = await app.request('/v1/circle/illumination', {
        headers: bearer(solo.id, solo.username),
    });
    const body = (await res.json()) as {
        circleSize: number;
        litCount: number;
        unlitCount: number;
        networkSize: number;
    };
    assert.equal(body.circleSize, 0);
    assert.equal(body.litCount, 0, 'nothing is lit before a single connection');
    // The unlit remainder is reported, not hidden — the honest nudge to connect.
    assert.equal(body.unlitCount, body.networkSize);
    assert.ok(body.networkSize > 0);
});

test('circle: illumination grows with real connections and relays carried onward', async () => {
    const a = seedUser();
    const b = seedUser();
    const c = seedUser();

    await follow(a, b.id);

    const before = (await (
        await app.request('/v1/circle/illumination', { headers: bearer(a.id, a.username) })
    ).json()) as { litCount: number; downstreamCount: number };
    assert.equal(before.litCount, 1, 'one connection lights one person');
    assert.equal(before.downstreamCount, 0);

    // a relays something; c relays it onward from a's edge. c is downstream of
    // a even though a and c have no direct edge — that is Reach.
    const aRelayId = randomUUID();
    db.upsertRelayEdge({
        id: aRelayId,
        relayerUserId: a.id,
        subjectSource: 'coalition_feed',
        subjectId: 'item-illum',
        parentRelayId: null,
        rootRelayId: aRelayId,
        chainDepth: 0,
        originAuthorId: b.id,
        note: null,
        active: true,
    });
    db.upsertRelayEdge({
        id: randomUUID(),
        relayerUserId: c.id,
        subjectSource: 'coalition_feed',
        subjectId: 'item-illum',
        parentRelayId: aRelayId,
        rootRelayId: aRelayId,
        chainDepth: 1,
        originAuthorId: b.id,
        note: null,
        active: true,
    });

    const after = (await (
        await app.request('/v1/circle/illumination', { headers: bearer(a.id, a.username) })
    ).json()) as { litCount: number; downstreamCount: number; relayedCount: number };
    assert.equal(after.relayedCount, 1);
    assert.equal(after.downstreamCount, 1, 'c carried it onward, so a lit c');
    assert.equal(after.litCount, 2);
});

test('circle: you cannot follow yourself', async () => {
    const a = seedUser();
    const res = await follow(a, a.id);
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { code: string }).code, 'invalid_request');
});
