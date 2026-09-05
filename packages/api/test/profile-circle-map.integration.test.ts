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
const { hashPassword } = await import('../src/services/auth');

process.env.MATRIX_HOMESERVER_DOMAIN = process.env.MATRIX_HOMESERVER_DOMAIN ?? 'test.local';

/**
 * A real user, so the two id spaces genuinely differ: the graph is keyed by the
 * Blackout UUID, the profile surface by the Matrix id. An earlier version of
 * this suite used one plain string for both and so could not see that
 * /circle-map and /palettes were handing an MXID to UUID-keyed lookups.
 */
const seedUser = () => {
    const id = randomUUID();
    const username = `u${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: hashPassword('Original-Pass-1234!'),
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return { id, username, mxid: `@${username}:test.local` };
};

/** Sign as a real seeded user, so ownership resolves via localpart = username. */
const headers = (u: { id: string; username: string }) => ({
    authorization: `Bearer ${signJwt(u.id, u.username, 600)}`,
    'content-type': 'application/json',
    'x-blackout-capabilities': 'profile.read,profile.write',
});

/** Ask for the map by the owner's **Matrix id**, as a real client does. */
const circleMapOf = async (owner: { mxid: string }, viewer: { id: string; username: string }) => {
    const res = await app.request(`/v1/profile/${owner.mxid}/circle-map`, {
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

    const owner = seedUser();
    const shown = seedUser();
    const hidden = seedUser();
    const oneWay = seedUser();
    const stranger = seedUser();

    // Two overlaps (both directions) plus one relationship the owner follows
    // without it being returned. Edges go in the graph's Blackout-id space.
    followUser(owner.id, shown.id);
    followUser(shown.id, owner.id);
    followUser(owner.id, hidden.id);
    followUser(hidden.id, owner.id);
    followUser(owner.id, oneWay.id);

    // The opt-in list is stored in the space the client sees: Matrix ids.
    upsertProfile(owner.mxid, { profile: { circleMapVisible: [shown.mxid] } });

    const asStranger = await circleMapOf(owner, stranger);
    // A one-way follow never appears: the other person never chose that edge,
    // so publishing it would expose a relationship they did not agree to.
    assert.deepEqual(
        asStranger.connections.map((c) => c.userId),
        [shown.mxid]
    );
    assert.equal(asStranger.visibleCount, 1);
    assert.equal(asStranger.eligibleCount, 2, 'both overlaps are eligible');
});

test('circle map resolves the Matrix id against the Blackout-keyed graph', async () => {
    __resetProfileStoreForTests();
    __resetFollowsForTests();

    const owner = seedUser();
    const friend = seedUser();
    followUser(owner.id, friend.id);
    followUser(friend.id, owner.id);
    upsertProfile(owner.mxid, { profile: { circleMapVisible: [friend.mxid] } });

    // The regression this guards: the path param is an MXID while mutualsOf is
    // keyed by UUID, so without the id-space hop every overlap resolved to none
    // and the map was permanently blank in production.
    const map = await circleMapOf(owner, friend);
    assert.equal(map.eligibleCount, 1, 'the overlap is found across id spaces');
    assert.deepEqual(
        map.connections.map((c) => c.userId),
        [friend.mxid],
        'and is reported back in the space the caller asked in'
    );
});

test('the owner sees their un-opted-in overlaps so they have something to opt in from', async () => {
    __resetProfileStoreForTests();
    __resetFollowsForTests();

    const owner = seedUser();
    const shown = seedUser();
    const notYet = seedUser();

    followUser(owner.id, shown.id);
    followUser(shown.id, owner.id);
    followUser(owner.id, notYet.id);
    followUser(notYet.id, owner.id);

    upsertProfile(owner.mxid, { profile: { circleMapVisible: [shown.mxid] } });

    const asOwner = await circleMapOf(owner, owner);
    assert.equal(asOwner.connections.length, 2);
    assert.deepEqual(
        asOwner.connections.find((c) => c.userId === notYet.mxid),
        { userId: notYet.mxid, visible: false }
    );
});

test('building a Circle never publishes it — opt-in starts empty', async () => {
    __resetProfileStoreForTests();
    __resetFollowsForTests();

    const owner = seedUser();
    const friend = seedUser();
    const stranger = seedUser();
    followUser(owner.id, friend.id);
    followUser(friend.id, owner.id);

    const asStranger = await circleMapOf(owner, stranger);
    assert.deepEqual(asStranger.connections, [], 'nothing is shown until opted in');
    assert.equal(asStranger.eligibleCount, 1);
});

test('an unknown palette id is dropped rather than themed into the profile', async () => {
    __resetProfileStoreForTests();
    const user = seedUser();
    const saved = upsertProfile(user.mxid, {
        profile: { paletteId: 'definitely-not-a-palette' },
    });
    assert.equal(saved.profile.paletteId, undefined);

    const ok = upsertProfile(user.mxid, { profile: { paletteId: 'clay_and_brass' } });
    assert.equal(ok.profile.paletteId, 'clay_and_brass');
});

test('palette progress counts the whole downstream chain, across id spaces', async () => {
    __resetProfileStoreForTests();
    __resetFollowsForTests();
    db.relayEdges.clear();

    const user = seedUser();
    const a = seedUser();
    const b = seedUser();
    followUser(user.id, a.id);
    followUser(user.id, b.id);

    const rootId = randomUUID();
    db.upsertRelayEdge({
        id: rootId,
        relayerUserId: user.id,
        subjectSource: 'coalition_feed',
        subjectId: 'subj-1',
        parentRelayId: null,
        rootRelayId: rootId,
        chainDepth: 0,
        originAuthorId: null,
        note: null,
        active: true,
    });
    const midId = randomUUID();
    db.upsertRelayEdge({
        id: midId,
        relayerUserId: 'downstream-1',
        subjectSource: 'coalition_feed',
        subjectId: 'subj-1',
        parentRelayId: rootId,
        rootRelayId: rootId,
        chainDepth: 1,
        originAuthorId: null,
        note: null,
        active: true,
    });
    // A second hop: only reachable by walking the chain, not by counting
    // direct children of the user's own edge.
    db.upsertRelayEdge({
        id: randomUUID(),
        relayerUserId: 'downstream-2',
        subjectSource: 'coalition_feed',
        subjectId: 'subj-1',
        parentRelayId: midId,
        rootRelayId: rootId,
        chainDepth: 2,
        originAuthorId: null,
        note: null,
        active: true,
    });

    const res = await app.request(`/v1/profile/${user.mxid}/palettes`, {
        headers: headers(user),
    });
    const body = (await res.json()) as {
        stats: {
            relaysMade: number;
            circleSize: number;
            peopleReached: number;
            chainDepthReached: number;
        };
        palettes: { palette: { id: string }; unlocked: boolean }[];
    };

    // All of these were 0 before the id-space fix.
    assert.equal(body.stats.relaysMade, 1);
    assert.equal(body.stats.circleSize, 2);
    // Both hops, not just the direct child — the same number the Illumination
    // meter shows on the same screen.
    assert.equal(body.stats.peopleReached, 2);
    assert.equal(body.stats.chainDepthReached, 2);
    assert.equal(body.palettes.find((p) => p.palette.id === 'first_light')?.unlocked, true);
    assert.equal(body.palettes.find((p) => p.palette.id === 'gathered')?.unlocked, false);
});
