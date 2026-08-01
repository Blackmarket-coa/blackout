import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

interface BountyLite {
    id: string;
    category: string;
    title: string;
}

function ensureUser(id: string, username: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username,
        email: `${username}@blackout.test`,
        passwordHash: 'test-hash',
        reputationScore: 100,
        reputationTier: 'member',
        pubkeyEd25519: `${id}-pubkey`,
    });
}

function headers(userId: string, username: string): Record<string, string> {
    ensureUser(userId, username);
    return {
        authorization: `Bearer ${signJwt(userId, username, 600)}`,
        'content-type': 'application/json',
    };
}

async function postBounty(
    poster: { id: string; username: string },
    category: string,
    title: string
): Promise<string> {
    const res = await app.request('/v1/bounties', {
        method: 'POST',
        headers: headers(poster.id, poster.username),
        body: JSON.stringify({
            category,
            title,
            description: `${title} — details`,
            rewardType: 'cash',
            rewardSummary: 'reward',
        }),
    });
    assert.equal(res.status, 201);
    const { bounty } = (await res.json()) as { bounty: { id: string } };
    return bounty.id;
}

const POSTER = { id: 'bounty-poster-1', username: 'poster' };
const VIEWER = { id: 'bounty-viewer-1', username: 'viewer' };

test('recommended bounties: ?categories filter reaches the matcher and ranks a preferred category first', async () => {
    // The poster (a different user than the viewer) opens one developer and one
    // creator bounty. The viewer's own posts are excluded, so both are candidates.
    const developerId = await postBounty(POSTER, 'developer', 'Ship a plugin');
    const creatorId = await postBounty(POSTER, 'creator', 'Cut a trailer');

    // No filter → the creator-relevant default ranks the creator bounty first.
    const defaultRes = await app.request('/v1/bounties/recommended', {
        headers: headers(VIEWER.id, VIEWER.username),
    });
    assert.equal(defaultRes.status, 200);
    const { bounties: byDefault } = (await defaultRes.json()) as { bounties: BountyLite[] };
    const defaultIds = byDefault.map((b) => b.id);
    assert.ok(defaultIds.includes(developerId) && defaultIds.includes(creatorId));
    assert.equal(byDefault[0].id, creatorId, 'default ranks a creator-relevant bounty first');

    // ?categories=developer → the developer bounty is now the preferred match and
    // ranks first, proving the query param threads through to recommendBounties.
    const filteredRes = await app.request('/v1/bounties/recommended?categories=developer', {
        headers: headers(VIEWER.id, VIEWER.username),
    });
    assert.equal(filteredRes.status, 200);
    const { bounties: filtered } = (await filteredRes.json()) as { bounties: BountyLite[] };
    assert.equal(filtered[0].id, developerId, 'preferred category is boosted to the top');
    assert.equal(filtered[0].category, 'developer');

    // Unknown categories are dropped; an all-invalid filter falls back to default.
    const bogusRes = await app.request('/v1/bounties/recommended?categories=not-a-category', {
        headers: headers(VIEWER.id, VIEWER.username),
    });
    assert.equal(bogusRes.status, 200);
    const { bounties: bogus } = (await bogusRes.json()) as { bounties: BountyLite[] };
    assert.equal(bogus[0].id, creatorId, 'invalid categories are ignored, default ordering holds');
});
