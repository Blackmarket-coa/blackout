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
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { upsertProfile, __resetProfileStoreForTests } = await import('../src/services/profileStore');
const { __resetFollowsForTests, followUser } = await import('../src/services/follows');

const headers = (userId: string) => ({
    authorization: `Bearer ${signJwt(userId, userId.replace(/[^a-z0-9]/gi, '') || 'user', 600)}`,
    'content-type': 'application/json',
    'x-blackout-capabilities': 'profile.read,profile.write',
});

const circleMapOf = async (owner: string, viewer: string) => {
    const res = await app.request(`/v1/profile/${owner}/circle-map`, {
        headers: headers(viewer),
    });
    return (await res.json()) as {
        connections: { userId: string; visible: boolean }[];
        eligibleCount: number;
        visibleCount: number;
    };
};

test('circle map shows only overlapping circles the owner opted in to', async () => {
    __resetProfileStoreForTests();
    __resetFollowsForTests();

    const owner = 'map-owner';
    const shown = 'map-shown';
    const hidden = 'map-hidden';
    const oneWay = 'map-one-way';

    // Two overlaps (both directions) plus one relationship the owner follows
    // without it being returned.
    followUser(owner, shown);
    followUser(shown, owner);
    followUser(owner, hidden);
    followUser(hidden, owner);
    followUser(owner, oneWay);

    upsertProfile(owner, { profile: { circleMapVisible: [shown] } });

    const asStranger = await circleMapOf(owner, 'a-stranger');
    // A one-way follow never appears: the other person never chose that edge,
    // so publishing it would expose a relationship they did not agree to.
    assert.deepEqual(
        asStranger.connections.map((c) => c.userId),
        [shown]
    );
    assert.equal(asStranger.visibleCount, 1);
    assert.equal(asStranger.eligibleCount, 2, 'both overlaps are eligible');
});

test('the owner sees their un-opted-in overlaps so they have something to opt in from', async () => {
    __resetProfileStoreForTests();
    __resetFollowsForTests();

    const owner = 'map-owner-2';
    const shown = 'shown-2';
    const notYet = 'not-yet-2';

    followUser(owner, shown);
    followUser(shown, owner);
    followUser(owner, notYet);
    followUser(notYet, owner);

    upsertProfile(owner, { profile: { circleMapVisible: [shown] } });

    const asOwner = await circleMapOf(owner, owner);
    assert.equal(asOwner.connections.length, 2);
    assert.deepEqual(
        asOwner.connections.find((c) => c.userId === notYet),
        { userId: notYet, visible: false }
    );
});

test('building a Circle never publishes it — opt-in starts empty', async () => {
    __resetProfileStoreForTests();
    __resetFollowsForTests();

    const owner = 'map-owner-3';
    const friend = 'friend-3';
    followUser(owner, friend);
    followUser(friend, owner);

    const asStranger = await circleMapOf(owner, 'stranger-3');
    assert.deepEqual(asStranger.connections, [], 'nothing is shown until opted in');
    assert.equal(asStranger.eligibleCount, 1);
});

test('an unknown palette id is dropped rather than themed into the profile', async () => {
    __resetProfileStoreForTests();
    const userId = 'palette-user';
    const saved = upsertProfile(userId, {
        profile: { paletteId: 'definitely-not-a-palette' },
    });
    assert.equal(saved.profile.paletteId, undefined);

    const ok = upsertProfile(userId, { profile: { paletteId: 'clay_and_brass' } });
    assert.equal(ok.profile.paletteId, 'clay_and_brass');
});

test('palette progress reflects the viewer’s real relays and Circle', async () => {
    __resetProfileStoreForTests();
    __resetFollowsForTests();
    db.relayEdges.clear();

    const userId = 'palette-progress';
    followUser(userId, 'a');
    followUser(userId, 'b');

    const rootId = randomUUID();
    db.upsertRelayEdge({
        id: rootId,
        relayerUserId: userId,
        subjectSource: 'coalition_feed',
        subjectId: 'subj-1',
        parentRelayId: null,
        rootRelayId: rootId,
        chainDepth: 0,
        originAuthorId: null,
        note: null,
        active: true,
    });
    // Someone carried it onward from this user's edge.
    db.upsertRelayEdge({
        id: randomUUID(),
        relayerUserId: 'downstream',
        subjectSource: 'coalition_feed',
        subjectId: 'subj-1',
        parentRelayId: rootId,
        rootRelayId: rootId,
        chainDepth: 1,
        originAuthorId: null,
        note: null,
        active: true,
    });

    const res = await app.request(`/v1/profile/${userId}/palettes`, {
        headers: headers(userId),
    });
    const body = (await res.json()) as {
        stats: { relaysMade: number; circleSize: number; peopleReached: number };
        palettes: { palette: { id: string }; unlocked: boolean }[];
    };

    assert.equal(body.stats.relaysMade, 1);
    assert.equal(body.stats.circleSize, 2);
    assert.equal(body.stats.peopleReached, 1);
    // One relay is all "First light" asks for.
    assert.equal(body.palettes.find((p) => p.palette.id === 'first_light')?.unlocked, true);
    assert.equal(body.palettes.find((p) => p.palette.id === 'gathered')?.unlocked, false);
});
