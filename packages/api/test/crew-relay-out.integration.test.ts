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
const { crewSizeStatus, CREW_SIZE_RANGE } = await import('@blackout/core');
const { saveRingMembership, newMembershipId } = await import('../src/services/coalitionStore');

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

const createCrew = async (owner: { id: string; username: string }) => {
    const res = await app.request('/v1/coalition/rings', {
        method: 'POST',
        headers: bearer(owner),
        body: JSON.stringify({
            name: 'Thursday crew',
            description: 'Small pod',
            kind: 'crew',
            visibility: 'private',
        }),
    });
    return ((await res.json()) as { ring: { id: string } }).ring;
};

const relayOut = (
    who: { id: string; username: string },
    ringId: string,
    body: Record<string, unknown>
) =>
    app.request(`/v1/coalition/rings/${ringId}/relay-out`, {
        method: 'POST',
        headers: bearer(who),
        body: JSON.stringify(body),
    });

test('a crew member can carry their own words out into the wider network', async () => {
    const owner = seedUser();
    const crew = await createCrew(owner);

    const res = await relayOut(owner, crew.id, {
        title: 'We need a van on Saturday',
        body: 'Talked about it in crew — worth asking wider.',
        note: 'relaying because the share is this weekend',
    });
    assert.equal(res.status, 201);

    const body = (await res.json()) as {
        feedItem: { id: string; authorId: string; title: string };
        relay: { id: string; chainDepth: number; note: string | null } | null;
    };

    // Published as the requester's own post…
    assert.equal(body.feedItem.authorId, owner.id);
    assert.equal(body.feedItem.title, 'We need a van on Saturday');
    // …and carried onward by their own origin relay, like anything else.
    assert.ok(body.relay);
    assert.equal(body.relay?.chainDepth, 0);
    assert.equal(body.relay?.note, 'relaying because the share is this weekend');
});

test('once carried out, it travels to the publisher’s Circle like any other post', async () => {
    const owner = seedUser();
    const follower = seedUser();
    const crew = await createCrew(owner);

    await app.request('/v1/circle', {
        method: 'POST',
        headers: bearer(follower),
        body: JSON.stringify({ followeeId: owner.id }),
    });

    await relayOut(owner, crew.id, { title: 'Crew idea worth sharing' });

    const feed = await app.request('/v1/feed', { headers: bearer(follower) });
    const items = ((await feed.json()) as { items: { subject: { title: string } | null }[] }).items;
    assert.ok(
        items.some((i) => i.subject?.title === 'Crew idea worth sharing'),
        'the follower sees it because they follow the publisher'
    );
});

test('a non-member cannot publish out of a crew they are not in', async () => {
    const owner = seedUser();
    const outsider = seedUser();
    const crew = await createCrew(owner);

    const res = await relayOut(outsider, crew.id, { title: 'Not mine to carry' });
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { code: string }).code, 'forbidden');
});

test('a member who left can no longer carry things out', async () => {
    const owner = seedUser();
    const leaver = seedUser();
    const crew = await createCrew(owner);

    // Private crews are invite-only, so seed the membership directly, then leave.
    saveRingMembership({
        id: newMembershipId(),
        ringId: crew.id,
        userId: leaver.id,
        role: 'member',
        active: true,
    });
    assert.equal((await relayOut(leaver, crew.id, { title: 'While a member' })).status, 201);

    await app.request(`/v1/coalition/rings/${crew.id}/leave`, {
        method: 'POST',
        headers: bearer(leaver),
    });
    assert.equal((await relayOut(leaver, crew.id, { title: 'After leaving' })).status, 403);
});

test('there is no route for publishing another member’s words', async () => {
    // The endpoint takes only a title/body from the requester and always stamps
    // authorId from the token — so the "carry out someone else's message" case
    // has no representation in the API surface at all.
    const owner = seedUser();
    const other = seedUser();
    const crew = await createCrew(owner);
    saveRingMembership({
        id: newMembershipId(),
        ringId: crew.id,
        userId: other.id,
        role: 'member',
        active: true,
    });

    const res = await relayOut(other, crew.id, {
        title: 'Attempted attribution',
        // Any author-ish field a caller invents is ignored by the schema.
        authorId: owner.id,
    });
    const body = (await res.json()) as { feedItem: { authorId: string } };
    assert.equal(body.feedItem.authorId, other.id, 'authorship always follows the token');
});

test('crew size guidance advises without blocking', () => {
    assert.equal(crewSizeStatus(2).state, 'forming');
    assert.equal(crewSizeStatus(CREW_SIZE_RANGE.min).state, 'healthy');
    assert.equal(crewSizeStatus(CREW_SIZE_RANGE.max).state, 'healthy');
    // A crew that outgrew the range keeps working — locking people out of a
    // group they already belong to would be worse than a crew of nine.
    assert.equal(crewSizeStatus(CREW_SIZE_RANGE.max + 1).state, 'crowded');
});
