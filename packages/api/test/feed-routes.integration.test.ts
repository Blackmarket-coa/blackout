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
const { upsertProfile, appendWallPost } = await import('../src/services/profileStore');

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

const bearer = (u: { id: string; username: string }) => ({
    authorization: `Bearer ${signJwt(u.id, u.username, 600)}`,
    'content-type': 'application/json',
});

/** A relayable native post. */
const seedPost = (authorId: string, title = 'Weekend produce share') => {
    const id = `feed-${randomUUID()}`;
    db.upsertCoalitionFeedItem({
        id,
        kind: 'aid',
        title,
        body: 'Ten boxes, Saturday morning.',
        createdAt: new Date().toISOString(),
        authorId,
        importance: 0,
        impact: 0,
        socialImpact: 0,
        score: 0,
        tags: [],
    });
    return id;
};

const follow = (from: { id: string; username: string }, toId: string) =>
    app.request('/v1/circle', {
        method: 'POST',
        headers: bearer(from),
        body: JSON.stringify({ followeeId: toId }),
    });

const relay = (who: { id: string; username: string }, body: Record<string, unknown>) =>
    app.request('/v1/feed/relays', {
        method: 'POST',
        headers: bearer(who),
        body: JSON.stringify(body),
    });

const feedOf = async (who: { id: string; username: string }) => {
    const res = await app.request('/v1/feed', { headers: bearer(who) });
    return (await res.json()) as {
        circleSize: number;
        items: {
            key: string;
            ring: 'circle' | 'reach';
            subject: { title: string } | null;
            path: { hops: { userId: string; active: boolean }[] } | null;
            alsoRelayedBy: string[];
        }[];
    };
};

test('feed: a brand-new account sees an empty feed, and that is the honest answer', async () => {
    const solo = seedUser();
    const body = await feedOf(solo);
    assert.equal(body.circleSize, 0);
    assert.deepEqual(body.items, [], 'nothing is injected to fill the gap');
});

test('feed: Circle ring carries posts by people you follow', async () => {
    const viewer = seedUser();
    const author = seedUser();
    const postId = seedPost(author.id);
    await follow(viewer, author.id);

    const body = await feedOf(viewer);
    const item = body.items.find((i) => i.key === `coalition_feed:${postId}`);
    assert.ok(item, 'a followed author’s post is in the feed');
    assert.equal(item?.ring, 'circle');
    // No relay carried it — you simply follow them.
    assert.equal(item?.path, null);
});

test('feed: a post by someone you do NOT follow stays out until a human relays it', async () => {
    const viewer = seedUser();
    const stranger = seedUser();
    const friend = seedUser();
    const postId = seedPost(stranger.id, 'Stranger post');
    await follow(viewer, friend.id);

    assert.equal((await feedOf(viewer)).items.length, 0, 'nothing reaches the viewer on its own');

    // The friend relays it. Now — and only now — it travels.
    const res = await relay(friend, { subjectSource: 'coalition_feed', subjectId: postId });
    assert.equal(res.status, 201);

    const body = await feedOf(viewer);
    const item = body.items.find((i) => i.key === `coalition_feed:${postId}`);
    assert.ok(item, 'the relay carried it into Reach');
    assert.equal(item?.ring, 'reach');
    assert.deepEqual(
        item?.path?.hops.map((h) => h.userId),
        [friend.id]
    );
});

test('feed: every hop of a chain is visible, never collapsed to the last relayer', async () => {
    const viewer = seedUser();
    const nearest = seedUser();
    const middle = seedUser();
    const origin = seedUser();
    const author = seedUser();
    const postId = seedPost(author.id);

    await follow(viewer, nearest.id);

    const first = (await (
        await relay(origin, {
            subjectSource: 'coalition_feed',
            subjectId: postId,
            note: 'relaying because the share is this weekend',
        })
    ).json()) as { relay: { id: string } };
    const second = (await (
        await relay(middle, {
            subjectSource: 'coalition_feed',
            subjectId: postId,
            viaRelayId: first.relay.id,
        })
    ).json()) as { relay: { id: string } };
    await relay(nearest, {
        subjectSource: 'coalition_feed',
        subjectId: postId,
        viaRelayId: second.relay.id,
    });

    const item = (await feedOf(viewer)).items.find((i) => i.key === `coalition_feed:${postId}`);
    assert.deepEqual(
        item?.path?.hops.map((h) => h.userId),
        [nearest.id, middle.id, origin.id],
        'all three relayers are named'
    );

    // Tapping the path shows every person in the chain, plus the commentary.
    const chainRes = await app.request(`/v1/feed/relays/${second.relay.id}/chain`, {
        headers: bearer(viewer),
    });
    const chain = (await chainRes.json()) as {
        path: { hops: { userId: string; note: string | null }[] };
        allRelayers: { userId: string }[];
    };
    assert.deepEqual(
        chain.path.hops.map((h) => h.userId),
        [middle.id, origin.id]
    );
    assert.equal(chain.path.hops[1]?.note, 'relaying because the share is this weekend');
    assert.equal(chain.allRelayers.length, 3);
});

test('feed: un-relaying drops it for your followers but not for a downstream relayer’s', async () => {
    const author = seedUser();
    const postId = seedPost(author.id);

    const carrier = seedUser(); // relays, then withdraws
    const downstream = seedUser(); // relayed it onward independently
    const carrierFollower = seedUser(); // reached it only through `carrier`
    const downstreamFollower = seedUser(); // reached it through `downstream`

    await follow(carrierFollower, carrier.id);
    await follow(downstreamFollower, downstream.id);

    const carried = (await (
        await relay(carrier, {
            subjectSource: 'coalition_feed',
            subjectId: postId,
        })
    ).json()) as { relay: { id: string } };
    await relay(downstream, {
        subjectSource: 'coalition_feed',
        subjectId: postId,
        viaRelayId: carried.relay.id,
    });

    // Both followers can see it while every edge is active.
    assert.equal((await feedOf(carrierFollower)).items.length, 1);
    assert.equal((await feedOf(downstreamFollower)).items.length, 1);

    const withdrawn = await app.request(`/v1/feed/relays/${carried.relay.id}`, {
        method: 'DELETE',
        headers: bearer(carrier),
    });
    assert.equal(withdrawn.status, 200);

    // "Anyone who only saw it through you loses visibility."
    assert.deepEqual((await feedOf(carrierFollower)).items, [], 'the carrier’s follower loses it');

    // "Downstream boosts that relayed it independently keep it alive on their own."
    const survivor = (await feedOf(downstreamFollower)).items;
    assert.equal(survivor.length, 1, 'the downstream relayer keeps it alive');
    // The withdrawn ancestor is still named in the chain, flagged inactive —
    // a chain with a hole in it would misrepresent how it travelled.
    assert.deepEqual(
        survivor[0]?.path?.hops.map((h) => ({ userId: h.userId, active: h.active })),
        [
            { userId: downstream.id, active: true },
            { userId: carrier.id, active: false },
        ]
    );
});

test('feed: when several people relay the same thing, the earliest path shows and the rest are named', async () => {
    const viewer = seedUser();
    const first = seedUser();
    const second = seedUser();
    const author = seedUser();
    const postId = seedPost(author.id);

    await follow(viewer, first.id);
    await follow(viewer, second.id);

    await relay(first, { subjectSource: 'coalition_feed', subjectId: postId });
    await new Promise((r) => setTimeout(r, 5));
    await relay(second, { subjectSource: 'coalition_feed', subjectId: postId });

    const items = (await feedOf(viewer)).items.filter((i) => i.key === `coalition_feed:${postId}`);
    assert.equal(items.length, 1, 'deduped to one card');
    assert.deepEqual(
        items[0]?.path?.hops.map((h) => h.userId),
        [first.id]
    );
    // Nothing is hidden: the other relayer is named on the card.
    assert.deepEqual(items[0]?.alsoRelayedBy, [second.id]);
});

test('feed: relaying is idempotent, so nobody appears twice in a chain', async () => {
    const relayer = seedUser();
    const author = seedUser();
    const postId = seedPost(author.id);

    const a = (await (
        await relay(relayer, {
            subjectSource: 'coalition_feed',
            subjectId: postId,
        })
    ).json()) as { relay: { id: string } };
    const b = (await (
        await relay(relayer, {
            subjectSource: 'coalition_feed',
            subjectId: postId,
        })
    ).json()) as { relay: { id: string } };

    assert.equal(a.relay.id, b.relay.id, 're-relaying reuses the same edge');
    assert.equal(db.listRelayEdgesForSubject('coalition_feed', postId).length, 1);
});

test('feed: a relay must point at something real, and a parent must carry the same subject', async () => {
    const relayer = seedUser();
    const author = seedUser();
    const postId = seedPost(author.id);
    const otherPostId = seedPost(author.id, 'Different post');

    const missing = await relay(relayer, {
        subjectSource: 'coalition_feed',
        subjectId: 'does-not-exist',
    });
    assert.equal(missing.status, 404);

    const parent = (await (
        await relay(relayer, {
            subjectSource: 'coalition_feed',
            subjectId: postId,
        })
    ).json()) as { relay: { id: string } };

    // Claiming you saw post B through a relay of post A would fabricate provenance.
    const mismatched = await relay(seedUser(), {
        subjectSource: 'coalition_feed',
        subjectId: otherPostId,
        viaRelayId: parent.relay.id,
    });
    assert.equal(mismatched.status, 400);
    assert.equal(((await mismatched.json()) as { code: string }).code, 'invalid_request');
});

test('feed: you can only withdraw your own relay', async () => {
    const relayer = seedUser();
    const other = seedUser();
    const author = seedUser();
    const postId = seedPost(author.id);

    const own = (await (
        await relay(relayer, {
            subjectSource: 'coalition_feed',
            subjectId: postId,
        })
    ).json()) as { relay: { id: string } };

    const res = await app.request(`/v1/feed/relays/${own.relay.id}`, {
        method: 'DELETE',
        headers: bearer(other),
    });
    assert.equal(res.status, 403);
});

test('feed: ordering is chronological, with no ranking of any kind', async () => {
    const viewer = seedUser();
    const author = seedUser();
    await follow(viewer, author.id);

    const older = seedPost(author.id, 'Older post');
    db.upsertCoalitionFeedItem({
        ...db.getCoalitionFeedItem(older)!,
        createdAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = seedPost(author.id, 'Newer post');
    db.upsertCoalitionFeedItem({
        ...db.getCoalitionFeedItem(newer)!,
        createdAt: '2026-06-01T00:00:00.000Z',
    });

    const items = (await feedOf(viewer)).items;
    const keys = items.map((i) => i.key);
    assert.ok(
        keys.indexOf(`coalition_feed:${newer}`) < keys.indexOf(`coalition_feed:${older}`),
        'newest first, by time alone'
    );
});

/** Put a wall post by `author` on `owner`'s wall, with the owner's setting. */
const seedWallPost = (
    owner: string,
    author: string,
    visibility: 'public' | 'friends' | 'private',
    body = 'Wall note'
) => {
    upsertProfile(owner, {
        profile: { wall: { visibility, whoCanPost: 'anyone', moderation: 'open' } },
    });
    return appendWallPost({ profileUserId: owner, authorId: author, body });
};

test('feed: a private wall’s posts never reach the author’s followers', async () => {
    const viewer = seedUser();
    const author = seedUser();
    const wallOwner = seedUser();
    await follow(viewer, author.id);

    // The author wrote it, and the viewer follows the author — but it lives on
    // someone else's private wall, and that owner's setting governs it.
    seedWallPost(wallOwner.id, author.id, 'private', 'Private wall note');

    const items = (await feedOf(viewer)).items;
    assert.ok(
        !items.some((i) => i.subject?.body === 'Private wall note'),
        'following the author must not unlock a private wall'
    );
});

test('feed: a friends-only wall reaches only viewers whose circle overlaps the owner', async () => {
    const outsider = seedUser();
    const insider = seedUser();
    const author = seedUser();
    const wallOwner = seedUser();

    await follow(outsider, author.id);
    await follow(insider, author.id);
    // Only `insider` and the wall owner hold each other — the two-sided consent
    // the Circle map also requires.
    await follow(insider, wallOwner.id);
    await follow(wallOwner, insider.id);

    seedWallPost(wallOwner.id, author.id, 'friends', 'Friends-only note');

    assert.ok(
        !(await feedOf(outsider)).items.some((i) => i.subject?.body === 'Friends-only note'),
        'a one-way follow of the author grants nothing'
    );
    assert.ok(
        (await feedOf(insider)).items.some((i) => i.subject?.body === 'Friends-only note'),
        'an overlapping circle with the wall owner does'
    );
});

test('feed: a public wall still flows, so the gate is not just blocking everything', async () => {
    const viewer = seedUser();
    const author = seedUser();
    const wallOwner = seedUser();
    await follow(viewer, author.id);
    seedWallPost(wallOwner.id, author.id, 'public', 'Public wall note');

    assert.ok((await feedOf(viewer)).items.some((i) => i.subject?.body === 'Public wall note'));
});

test('feed: a non-public stream cannot be relayed at all', async () => {
    const relayer = seedUser();
    for (const visibility of ['private', 'member_only'] as const) {
        const streamId = `stream-${visibility}-${randomUUID()}`;
        db.upsertStream({
            id: streamId,
            creatorId: relayer.id,
            state: 'live',
            title: `A ${visibility} stream`,
            tags: [],
            visibility,
            allowedSubscriberIds: [],
            latencyProfile: 'normal',
        });

        const res = await relay(relayer, { subjectSource: 'stream', subjectId: streamId });
        // Refused at resolution, so the title and creator never reach a Circle.
        assert.equal(res.status, 404, `${visibility} stream must not be relayable`);
    }
});

test('feed: a public stream is still relayable', async () => {
    const relayer = seedUser();
    const streamId = `stream-public-${randomUUID()}`;
    db.upsertStream({
        id: streamId,
        creatorId: relayer.id,
        state: 'live',
        title: 'A public stream',
        tags: [],
        visibility: 'public',
        allowedSubscriberIds: [],
        latencyProfile: 'normal',
    });
    const res = await relay(relayer, { subjectSource: 'stream', subjectId: streamId });
    assert.equal(res.status, 201);
});

test('feed: ?ring=circle filters before the limit, so Circle items are not lost to a Reach-heavy page', async () => {
    const viewer = seedUser();
    const author = seedUser();
    const relayer = seedUser();
    const stranger = seedUser();
    await follow(viewer, author.id);
    await follow(viewer, relayer.id);

    // One old Circle post, then a wave of newer relayed items.
    const circlePost = seedPost(author.id, 'The Circle post');
    db.upsertCoalitionFeedItem({
        ...db.getCoalitionFeedItem(circlePost)!,
        createdAt: '2026-01-01T00:00:00.000Z',
    });
    for (let i = 0; i < 5; i += 1) {
        const id = seedPost(stranger.id, `Relayed ${i}`);
        await relay(relayer, { subjectSource: 'coalition_feed', subjectId: id });
    }

    // A small page whose newest entries are all Reach. Filtering after the
    // slice returned nothing here, and the client said the Circle was silent.
    const res = await app.request('/v1/feed?ring=circle&limit=3', {
        headers: bearer(viewer),
    });
    const items = ((await res.json()) as { items: { subject: { title: string } | null }[] }).items;
    assert.ok(
        items.some((i) => i.subject?.title === 'The Circle post'),
        'the Circle post survives a Reach-heavy page'
    );
    assert.ok(items.length > 0);
});

test('profile: a locked palette cannot be set directly', async () => {
    const user = seedUser();
    // `long_relay` needs a 10-hop chain; this account has relayed nothing.
    const attempted = upsertProfile(user.id, { profile: { paletteId: 'long_relay' } });
    assert.equal(
        attempted.profile.paletteId,
        undefined,
        'an unearned palette is refused rather than trusted from the client'
    );

    // A palette that needs nothing still works, so the gate is not blanket-denying.
    const free = upsertProfile(user.id, { profile: { paletteId: 'canopy_floor' } });
    assert.equal(free.profile.paletteId, 'canopy_floor');
});
