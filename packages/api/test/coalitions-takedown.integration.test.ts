import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';
process.env.BLACKOUT_ADMIN_USERS = 'td-admin';
process.env.FREEBLACKMARKET_STUB = '1';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { resetMarketplaceRegistry } = await import('../src/integrations/marketplace');

function auth(user: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(user, user, 600)}`,
        'content-type': 'application/json',
    };
}

function ensureUser(id: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username: id,
        email: `${id}@example.test`,
        passwordHash: 'hash',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: `pk-${id}`,
    });
}

const ADMIN = 'td-admin';
const FOUNDER = 'td-founder';
const STEWARD_A = 'td-steward-a';
const STEWARD_B = 'td-steward-b';
const MEMBER = 'td-member';
for (const id of [ADMIN, FOUNDER, STEWARD_A, STEWARD_B, MEMBER]) ensureUser(id);

async function found(name: string) {
    const res = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ name, mission: 'Carry on' }),
    });
    const coalition = ((await res.json()) as { coalition: { id: string } }).coalition;
    for (const m of [STEWARD_A, STEWARD_B, MEMBER]) {
        await app.request(`/v1/coalitions/${coalition.id}/join`, {
            method: 'POST',
            headers: auth(m),
        });
    }
    for (const m of [STEWARD_A, STEWARD_B]) {
        await app.request(`/v1/coalitions/${coalition.id}/members/${m}`, {
            method: 'PATCH',
            headers: auth(FOUNDER),
            body: JSON.stringify({ role: 'steward' }),
        });
    }
    return coalition;
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    resetMarketplaceRegistry();
});

// --- takedown ---------------------------------------------------------------

test('only the platform can take a coalition down', async () => {
    const coalition = await found('Not Yours');
    const byFounder = await app.request(`/v1/coalitions/${coalition.id}/takedown`, {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ reason: 'let me out' }),
    });
    assert.equal(byFounder.status, 403, 'a founder cannot take down their own coalition');

    const byAdmin = await app.request(`/v1/coalitions/${coalition.id}/takedown`, {
        method: 'POST',
        headers: auth(ADMIN),
        body: JSON.stringify({ reason: 'fraud report upheld' }),
    });
    assert.equal(byAdmin.status, 200, await byAdmin.text());
    const stored = db.getCoalition(coalition.id)!;
    assert.ok(stored.takenDownAt);
    assert.equal(stored.takedownReason, 'fraud report upheld');
});

test('a takedown actually stops things, and the coalition cannot undo it', async () => {
    const coalition = await found('Stopped');
    const created = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ type: 'drive', title: 'Coats' }),
    });
    const campaign = ((await created.json()) as { campaign: { id: string } }).campaign;

    await app.request(`/v1/coalitions/${coalition.id}/takedown`, {
        method: 'POST',
        headers: auth(ADMIN),
        body: JSON.stringify({ reason: 'stop' }),
    });

    // Money, boosts, joining, campaigns and amplification all refuse. Archiving
    // used to set a timestamp that most of these never checked.
    const contribute = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contribute`,
        { method: 'POST', headers: auth(MEMBER), body: JSON.stringify({ amountCents: 500 }) }
    );
    assert.ok(contribute.status >= 400, 'no money moves');

    const boosted = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/boost`,
        { method: 'POST', headers: auth(MEMBER) }
    );
    assert.equal(boosted.status, 403);
    assert.equal(((await boosted.json()) as { code: string }).code, 'taken_down');

    const joined = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(ADMIN),
    });
    assert.equal(joined.status, 403);

    const newCampaign = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ type: 'drive', title: 'Another' }),
    });
    assert.equal(newCampaign.status, 403);

    // The founder's own archive lever cannot clear a platform decision.
    await app.request(`/v1/coalitions/${coalition.id}/archive`, {
        method: 'POST',
        headers: auth(FOUNDER),
    });
    assert.ok(db.getCoalition(coalition.id)?.takenDownAt, 'still taken down');
});

test('the platform can put it back', async () => {
    const coalition = await found('Restored');
    await app.request(`/v1/coalitions/${coalition.id}/takedown`, {
        method: 'POST',
        headers: auth(ADMIN),
        body: JSON.stringify({ reason: 'mistake' }),
    });
    const back = await app.request(`/v1/coalitions/${coalition.id}/reinstate`, {
        method: 'POST',
        headers: auth(ADMIN),
    });
    assert.equal(back.status, 200);
    assert.equal(db.getCoalition(coalition.id)?.takenDownAt, undefined);
    assert.ok(db.getCoalition(coalition.id)?.reinstatedAt);

    const boosted = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(ADMIN),
    });
    assert.equal(boosted.status, 200, 'the coalition works again');
});

test('taking down closes the Matrix Space rather than leaving it open', async () => {
    const sent: Array<{ type: string; content: Record<string, unknown> }> = [];
    __setCoalitionMatrixForTests({
        createRoom: async () => ({ ok: true as const, status: 200, roomId: '!space:test' }),
        inviteToRoom: async () => ({ ok: true as const, status: 200 }),
        adminJoinUserToRoom: async () => ({ ok: true as const, status: 200 }),
        getStateEvent: async () => ({
            ok: true as const,
            status: 200,
            content: { users: { '@other:test': 50 }, events_default: 0 },
        }),
        sendStateEvent: async (_room: string, type: string, content: Record<string, unknown>) => {
            sent.push({ type, content });
            return { ok: true as const, status: 200, eventId: '$e' };
        },
    } as never);

    const coalition = await found('Sealed');
    sent.length = 0;
    await app.request(`/v1/coalitions/${coalition.id}/takedown`, {
        method: 'POST',
        headers: auth(ADMIN),
        body: JSON.stringify({ reason: 'stop' }),
    });

    const joinRules = sent.find((e) => e.type === 'm.room.join_rules');
    assert.equal(joinRules?.content.join_rule, 'invite', 'nobody new gets in');
    const levels = sent.find((e) => e.type === 'm.room.power_levels');
    assert.equal(levels?.content.events_default, 100, 'nobody inside can post');
    // Read-merge-write: the other member's level survives.
    assert.deepEqual(levels?.content.users, { '@other:test': 50 });
});

// --- succession -------------------------------------------------------------

test('stewards can succeed a founder who has gone, by quorum', async () => {
    const coalition = await found('Orphaned');

    // A plain member cannot petition.
    const byMember = await app.request(`/v1/coalitions/${coalition.id}/succession`, {
        method: 'POST',
        headers: auth(MEMBER),
        body: JSON.stringify({ reason: 'founder is gone' }),
    });
    assert.equal(byMember.status, 403);

    const opened = await app.request(`/v1/coalitions/${coalition.id}/succession`, {
        method: 'POST',
        headers: auth(STEWARD_A),
        body: JSON.stringify({ reason: 'founder inactive six months' }),
    });
    assert.equal(opened.status, 201, await opened.text());

    // One steward cannot appoint themselves.
    const selfSecond = await app.request(`/v1/coalitions/${coalition.id}/succession/second`, {
        method: 'POST',
        headers: auth(STEWARD_A),
    });
    assert.equal(selfSecond.status, 403, 'the candidate cannot second themselves');

    // The other steward's second reaches quorum and the role transfers.
    const second = await app.request(`/v1/coalitions/${coalition.id}/succession/second`, {
        method: 'POST',
        headers: auth(STEWARD_B),
    });
    const secondBody = await second.text();
    assert.equal(second.status, 200, secondBody);
    assert.equal(
        (JSON.parse(secondBody) as { petition: { status: string } }).petition.status,
        'approved'
    );

    const view = (await (
        await app.request(`/v1/coalitions/${coalition.id}`, { headers: auth(STEWARD_A) })
    ).json()) as { members: Array<{ userId: string; role: string }> };
    assert.equal(view.members.find((m) => m.userId === STEWARD_A)?.role, 'founder');
    assert.equal(view.members.find((m) => m.userId === FOUNDER)?.role, 'steward');
});

test('only one petition runs at a time', async () => {
    const coalition = await found('One At A Time');
    await app.request(`/v1/coalitions/${coalition.id}/succession`, {
        method: 'POST',
        headers: auth(STEWARD_A),
        body: JSON.stringify({ reason: 'first' }),
    });
    const second = await app.request(`/v1/coalitions/${coalition.id}/succession`, {
        method: 'POST',
        headers: auth(STEWARD_B),
        body: JSON.stringify({ reason: 'second' }),
    });
    // Two live petitions would split the stewards' seconds between candidates
    // and neither would ever reach quorum.
    assert.equal(second.status, 409);
    assert.equal(((await second.json()) as { code: string }).code, 'petition_open');
});
