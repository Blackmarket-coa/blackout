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
process.env.BLACKOUT_ADMIN_USERS = 'asset-moderator';

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const seedUser = (username?: string) => {
    const id = randomUUID();
    const name = username ?? `user-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username: name,
        email: `${name}@example.com`,
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

const moderator = () => seedUser('asset-moderator');

const submit = async (
    who: { id: string; username: string },
    overrides: Record<string, unknown> = {}
) => {
    const res = await app.request('/v1/assets', {
        method: 'POST',
        headers: bearer(who),
        body: JSON.stringify({
            kind: 'sticker',
            name: 'Compost bin',
            mediaUrl: 'mxc://blackout/sticker-1',
            ...overrides,
        }),
    });
    return { res, body: (await res.json()) as { asset: { id: string; status: string } } };
};

const approve = (mod: { id: string; username: string }, assetId: string) =>
    app.request(`/v1/assets/${assetId}/approve`, {
        method: 'POST',
        headers: bearer(mod),
        body: JSON.stringify({ note: 'looks good' }),
    });

test('a new asset starts pending and is not shareable', async () => {
    db.communityAssets.clear();
    const creator = seedUser();
    const { res, body } = await submit(creator);

    assert.equal(res.status, 201);
    assert.equal(body.asset.status, 'pending');

    // The public shelf shows approved assets only.
    const shelf = await app.request('/v1/assets', { headers: bearer(creator) });
    assert.deepEqual(((await shelf.json()) as { assets: unknown[] }).assets, []);
});

test('a pending asset cannot travel — relaying it is refused', async () => {
    db.communityAssets.clear();
    db.relayEdges.clear();
    const creator = seedUser();
    const { body } = await submit(creator);

    const relayed = await app.request('/v1/feed/relays', {
        method: 'POST',
        headers: bearer(creator),
        body: JSON.stringify({
            subjectSource: 'community_asset',
            subjectId: body.asset.id,
        }),
    });
    // There is no path by which an unreviewed upload spreads.
    assert.equal(relayed.status, 404);
});

test('an approved asset spreads the same way as anything else — a person relays it', async () => {
    db.communityAssets.clear();
    db.relayEdges.clear();
    const creator = seedUser();
    const follower = seedUser();
    const mod = moderator();

    const { body } = await submit(creator);
    assert.equal((await approve(mod, body.asset.id)).status, 200);

    await app.request('/v1/circle', {
        method: 'POST',
        headers: bearer(follower),
        body: JSON.stringify({ followeeId: creator.id }),
    });

    const relayed = await app.request('/v1/feed/relays', {
        method: 'POST',
        headers: bearer(creator),
        body: JSON.stringify({ subjectSource: 'community_asset', subjectId: body.asset.id }),
    });
    assert.equal(relayed.status, 201);

    const feed = await app.request('/v1/feed', { headers: bearer(follower) });
    const items = ((await feed.json()) as { items: { subject: { title: string } | null }[] }).items;
    assert.ok(items.some((i) => i.subject?.title === 'Compost bin'));
});

test('only a moderator can approve, reject or retire', async () => {
    db.communityAssets.clear();
    const creator = seedUser();
    const { body } = await submit(creator);

    // Not even the creator can wave their own asset through.
    const selfApprove = await approve(creator, body.asset.id);
    assert.equal(selfApprove.status, 403);
});

test('a rejection carries its reason so the creator can answer it', async () => {
    db.communityAssets.clear();
    const creator = seedUser();
    const mod = moderator();
    const { body } = await submit(creator);

    const res = await app.request(`/v1/assets/${body.asset.id}/reject`, {
        method: 'POST',
        headers: bearer(mod),
        body: JSON.stringify({ note: 'Reuses someone else’s artwork' }),
    });
    const rejected = (await res.json()) as {
        asset: { status: string; reviewNote: string; reviewedBy: string };
    };
    assert.equal(rejected.asset.status, 'rejected');
    assert.equal(rejected.asset.reviewNote, 'Reuses someone else’s artwork');
    assert.equal(rejected.asset.reviewedBy, mod.id);
});

test('an asset already reviewed cannot be reviewed again', async () => {
    db.communityAssets.clear();
    const creator = seedUser();
    const mod = moderator();
    const { body } = await submit(creator);

    await approve(mod, body.asset.id);
    const again = await approve(mod, body.asset.id);
    assert.equal(again.status, 400);
});

test('retiring stops an asset travelling without rewriting who made it', async () => {
    db.communityAssets.clear();
    const creator = seedUser();
    const mod = moderator();
    const { body } = await submit(creator);
    await approve(mod, body.asset.id);

    const before = db.getCommunityAsset(body.asset.id)!;
    await app.request(`/v1/assets/${body.asset.id}/retire`, {
        method: 'POST',
        headers: bearer(mod),
        body: JSON.stringify({ note: 'Reported repeatedly' }),
    });

    const after = db.getCommunityAsset(body.asset.id)!;
    assert.equal(after.status, 'retired');
    assert.equal(after.creatorId, before.creatorId, 'authorship is permanent');
    // The ordinal is left alone so nobody else's credential shifts.
    assert.equal(after.foundingOrdinal, before.foundingOrdinal);
});

test('founding ordinals are stamped in approval order, per kind', async () => {
    db.communityAssets.clear();
    const mod = moderator();
    const first = seedUser();
    const second = seedUser();

    const a = await submit(first, { name: 'First sticker' });
    const b = await submit(second, { name: 'Second sticker' });
    const coin = await submit(first, { kind: 'coin', name: 'First coin' });

    await approve(mod, a.body.asset.id);
    await approve(mod, b.body.asset.id);
    await approve(mod, coin.body.asset.id);

    assert.equal(db.getCommunityAsset(a.body.asset.id)?.foundingOrdinal, 1);
    assert.equal(db.getCommunityAsset(b.body.asset.id)?.foundingOrdinal, 2);
    // Kinds are numbered independently, so an early coin is still a first coin.
    assert.equal(db.getCommunityAsset(coin.body.asset.id)?.foundingOrdinal, 1);
});

test('founding credentials name one badge per kind, and report remaining slots', async () => {
    db.communityAssets.clear();
    const mod = moderator();
    const creator = seedUser();

    const one = await submit(creator, { name: 'Sticker one' });
    const two = await submit(creator, { name: 'Sticker two' });
    await approve(mod, one.body.asset.id);
    await approve(mod, two.body.asset.id);

    const res = await app.request(`/v1/assets/founding/${creator.id}`, {
        headers: bearer(creator),
    });
    const body = (await res.json()) as {
        credentials: { kind: string; ordinal: number; badgeId: string }[];
        slotsRemaining: { sticker: number };
    };

    // Volume does not multiply the credential — it says "you were here at the
    // start", not "you uploaded the most".
    assert.equal(body.credentials.length, 1);
    assert.deepEqual(body.credentials[0], {
        kind: 'sticker',
        ordinal: 1,
        badgeId: 'founding_sticker_contributor',
    });
    // The remaining count is reported, so "be early" is checkable.
    assert.equal(body.slotsRemaining.sticker, 48);
});

test('attribution names the creator of an asset', async () => {
    db.communityAssets.clear();
    const creator = seedUser();
    const mod = moderator();
    const { body } = await submit(creator);
    await approve(mod, body.asset.id);

    const res = await app.request(`/v1/assets/${body.asset.id}/attribution`, {
        headers: bearer(seedUser()),
    });
    const attribution = (await res.json()) as { creatorId: string; foundingOrdinal: number };
    assert.equal(attribution.creatorId, creator.id);
    assert.equal(attribution.foundingOrdinal, 1);
});
