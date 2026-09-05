import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

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

const headers = (user = 'gov-user') => ({
    authorization: `Bearer ${signJwt(user, 'govuser', 600)}`,
    'content-type': 'application/json',
    'x-blackout-capabilities': 'governance.read,governance.write',
});

const COMMUNITY = randomUUID();

async function propose(body: Record<string, unknown>) {
    const res = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ communityId: COMMUNITY, title: 'A proposal', ...body }),
    });
    return res;
}

const listProposals = async (query = '') => {
    const res = await app.request(`/v1/governance/proposals${query}`, { headers: headers() });
    assert.equal(res.status, 200, `listing ${query || '(all)'} should resolve`);
    return (await res.json()) as {
        proposals: { id: string; scope: string; communityId: string; title: string }[];
    };
};

test('a proposal is a community proposal unless it says otherwise', async () => {
    const res = await propose({ title: 'Change our meeting night' });
    assert.equal(res.status, 201);
    const created = (await res.json()) as { id: string; scope: string };

    // The default matters: every caller that predates the scope field keeps its
    // existing meaning rather than silently becoming a platform proposal.
    assert.equal(created.scope, 'community');
});

test('a platform proposal is recorded as one and keeps its convening community', async () => {
    const res = await propose({ title: 'Raise the relay chain depth cap', scope: 'platform' });
    assert.equal(res.status, 201);
    const created = (await res.json()) as { id: string; scope: string; communityId: string };

    assert.equal(created.scope, 'platform');
    // Scope says what is being decided, not who decides it — the proposal is
    // still convened by a real community.
    assert.equal(created.communityId, COMMUNITY);
});

test('platform proposals can be found across communities, which is the point', async () => {
    const otherCommunity = randomUUID();
    const platformElsewhere = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
            communityId: otherCommunity,
            title: 'Adopt a network-wide code of conduct',
            scope: 'platform',
        }),
    });
    assert.equal(platformElsewhere.status, 201);
    const raised = (await platformElsewhere.json()) as { id: string };

    const { proposals } = await listProposals('?scope=platform');
    const ids = proposals.map((p) => p.id);

    assert.ok(
        ids.includes(raised.id),
        'a platform proposal raised in another community is still found'
    );
    assert.ok(
        proposals.every((p) => p.scope === 'platform'),
        'community proposals are excluded'
    );
    // Without a scope filter the community proposals are still there — the
    // filter narrows the list, it does not hide rows from the unfiltered view.
    const all = await listProposals();
    assert.ok(all.proposals.length > proposals.length);
});

test('proposals can still be narrowed to one community, and by status', async () => {
    const mine = randomUUID();
    await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ communityId: mine, title: 'Only ours' }),
    });

    const { proposals } = await listProposals(`?communityId=${mine}`);
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0]?.title, 'Only ours');

    const closed = await listProposals(`?communityId=${mine}&status=closed`);
    assert.equal(closed.proposals.length, 0, 'status narrows too');
});

test('an unknown scope is rejected rather than silently matching nothing', async () => {
    const res = await app.request('/v1/governance/proposals?scope=galactic', {
        headers: headers(),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'invalid_request');
});

test('proposals written before the scope column read as community proposals', async () => {
    // Simulates a row that predates migration 089: no `scope` at all. It must
    // list as a community proposal rather than being dropped from every view.
    const legacyId = randomUUID();
    db.createVote({
        id: legacyId,
        communityId: COMMUNITY,
        proposerId: randomUUID(),
        title: 'Raised before scopes existed',
        voteType: 'yes_no',
        options: [{ id: 'yes', text: 'Yes' }],
        requiresQuorum: 50,
        durationHours: 168,
        status: 'active',
    });

    const community = await listProposals('?scope=community');
    assert.ok(
        community.proposals.some((p) => p.id === legacyId),
        'a scope-less row is treated as a community proposal'
    );
    assert.equal(
        community.proposals.find((p) => p.id === legacyId)?.scope,
        'community',
        'and is reported with the scope filled in'
    );

    const platform = await listProposals('?scope=platform');
    assert.ok(!platform.proposals.some((p) => p.id === legacyId));
});

test('the listing is newest first', async () => {
    const { proposals } = await listProposals();
    const timestamps = proposals.map((p) => (p as unknown as { createdAt: string }).createdAt);
    const sorted = [...timestamps].sort((a, b) => b.localeCompare(a));
    assert.deepEqual(timestamps, sorted);
});
