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
const { countActiveMembers, canManageRing } = await import('@blackout/core');

function authHeader(user: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(user, 'coalition', 600)}`,
        'content-type': 'application/json',
    };
}

async function createRing(body: Record<string, unknown>, user = 'ring-owner') {
    return app.request('/v1/coalition/rings', {
        method: 'POST',
        headers: authHeader(user),
        body: JSON.stringify(body),
    });
}

test('countActiveMembers + canManageRing helpers', () => {
    const members = [
        { userId: 'a', role: 'owner' as const, active: true },
        { userId: 'b', role: 'member' as const, active: true },
        { userId: 'c', role: 'member' as const, active: false },
    ];
    assert.equal(countActiveMembers(members), 2);
    assert.equal(canManageRing(members, 'a'), true);
    assert.equal(canManageRing(members, 'b'), false);
});

test('ring lifecycle: create (owner auto-member), join, leave, member metric', async () => {
    const created = await createRing({ name: 'Riverside Crew', kind: 'crew', visibility: 'public' });
    assert.equal(created.status, 201);
    const { ring, memberCount } = (await created.json()) as {
        ring: { id: string; ownerId: string };
        memberCount: number;
    };
    assert.equal(memberCount, 1, 'creator is the founding member');

    // appears in public list with member count
    const listRes = await app.request('/v1/coalition/rings', { headers: authHeader('viewer') });
    const { rings } = (await listRes.json()) as {
        rings: Array<{ id: string; memberCount: number }>;
    };
    assert.ok(rings.find((r) => r.id === ring.id && r.memberCount === 1));

    // another user joins → count 2
    const join = await app.request(`/v1/coalition/rings/${ring.id}/join`, {
        method: 'POST',
        headers: authHeader('joiner'),
    });
    assert.equal(join.status, 200);
    assert.equal(((await join.json()) as { memberCount: number }).memberCount, 2);

    // detail lists active members
    const detail = await app.request(`/v1/coalition/rings/${ring.id}`, { headers: authHeader('viewer') });
    const detailBody = (await detail.json()) as {
        memberCount: number;
        members: Array<{ userId: string; role: string }>;
    };
    assert.equal(detailBody.memberCount, 2);

    // joiner leaves → back to 1
    const leave = await app.request(`/v1/coalition/rings/${ring.id}/leave`, {
        method: 'POST',
        headers: authHeader('joiner'),
    });
    assert.equal(((await leave.json()) as { memberCount: number }).memberCount, 1);

    // a user's rings (profile view)
    const mine = await app.request('/v1/coalition/rings?memberId=ring-owner', {
        headers: authHeader('viewer'),
    });
    const mineBody = (await mine.json()) as { rings: Array<{ id: string }> };
    assert.ok(mineBody.rings.find((r) => r.id === ring.id));
});

test('private rings are invite-only (join 403) and hidden from public list', async () => {
    const created = await createRing({ name: 'Inner Circle', kind: 'circle', visibility: 'private' });
    const { ring } = (await created.json()) as { ring: { id: string } };

    const list = await app.request('/v1/coalition/rings', { headers: authHeader('viewer') });
    const { rings } = (await list.json()) as { rings: Array<{ id: string }> };
    assert.ok(!rings.find((r) => r.id === ring.id), 'private ring not in public list');

    const join = await app.request(`/v1/coalition/rings/${ring.id}/join`, {
        method: 'POST',
        headers: authHeader('outsider'),
    });
    assert.equal(join.status, 403);
});

test('only owners/admins can change member roles', async () => {
    const created = await createRing({ name: 'Guild Hall', kind: 'guild', visibility: 'public' });
    const { ring } = (await created.json()) as { ring: { id: string } };
    await app.request(`/v1/coalition/rings/${ring.id}/join`, {
        method: 'POST',
        headers: authHeader('member-1'),
    });

    const forbidden = await app.request(`/v1/coalition/rings/${ring.id}/members/member-1`, {
        method: 'PATCH',
        headers: authHeader('member-1'),
        body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(forbidden.status, 403);

    const ok = await app.request(`/v1/coalition/rings/${ring.id}/members/member-1`, {
        method: 'PATCH',
        headers: authHeader('ring-owner'),
        body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { membership: { role: string } }).membership.role, 'admin');
});

test('private ring: invite → accept is the way in (direct join stays 403)', async () => {
    const created = await createRing({ name: 'Cell A', kind: 'circle', visibility: 'private' });
    const { ring } = (await created.json()) as { ring: { id: string } };

    // a non-manager cannot invite
    const cantInvite = await app.request(`/v1/coalition/rings/${ring.id}/invites`, {
        method: 'POST',
        headers: authHeader('rando'),
        body: JSON.stringify({ inviteeId: 'invitee-1' }),
    });
    assert.equal(cantInvite.status, 403);

    // owner invites
    const invite = await app.request(`/v1/coalition/rings/${ring.id}/invites`, {
        method: 'POST',
        headers: authHeader('ring-owner'),
        body: JSON.stringify({ inviteeId: 'invitee-1' }),
    });
    assert.equal(invite.status, 201);

    // invitee sees it in their pending list
    const mine = await app.request('/v1/coalition/rings/invites/mine', {
        headers: authHeader('invitee-1'),
    });
    const mineBody = (await mine.json()) as { invitations: Array<{ ringId: string }> };
    assert.ok(mineBody.invitations.some((i) => i.ringId === ring.id));

    // direct join is still refused for a private ring
    const join = await app.request(`/v1/coalition/rings/${ring.id}/join`, {
        method: 'POST',
        headers: authHeader('invitee-1'),
    });
    assert.equal(join.status, 403);

    // accepting the invite makes them a member
    const accept = await app.request(`/v1/coalition/rings/${ring.id}/invites/accept`, {
        method: 'POST',
        headers: authHeader('invitee-1'),
    });
    assert.equal(accept.status, 200);
    assert.equal(((await accept.json()) as { memberCount: number }).memberCount, 2);

    // accepting again with no pending invite → 404
    const again = await app.request(`/v1/coalition/rings/${ring.id}/invites/accept`, {
        method: 'POST',
        headers: authHeader('invitee-1'),
    });
    assert.equal(again.status, 404);
});

test('user-search resolves a username to a blackout id (for the invite picker)', async () => {
    const id = `user-search-${Math.random().toString(36).slice(2, 8)}`;
    db.createUser({
        id,
        username: 'searchable_organizer',
        email: `${id}@example.test`,
        passwordHash: 'h',
        reputationScore: 1,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    const res = await app.request('/v1/coalition/user-search?q=searchable_org', {
        headers: authHeader('searcher'),
    });
    assert.equal(res.status, 200);
    const { users } = (await res.json()) as { users: Array<{ id: string; username: string }> };
    assert.ok(users.some((u) => u.id === id && u.username === 'searchable_organizer'));

    // search requires auth
    const noauth = await app.request('/v1/coalition/user-search?q=x');
    assert.equal(noauth.status, 401);
});

test('public rings with a location surface on the communities map layer', async () => {
    const created = await createRing({
        name: 'Dockside Guild',
        kind: 'guild',
        visibility: 'public',
        location: { latitude: 40.7, longitude: -74.0, address: 'Pier 9' },
    });
    const { ring } = (await created.json()) as { ring: { id: string } };
    const mapRes = await app.request('/v1/coalition/spatial-feed?layers=communities', {
        headers: authHeader('viewer'),
    });
    const map = (await mapRes.json()) as { items: Array<{ id: string; layer: string }> };
    assert.ok(map.items.some((i) => i.id === `ring:${ring.id}` && i.layer === 'communities'));
});
