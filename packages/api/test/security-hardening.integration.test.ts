import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = 'memory';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { isBlockedHost } = await import('../src/services/outboundEventWebhooks');

function headersFor(userId: string, capabilities: string[]) {
    return {
        authorization: `Bearer ${signJwt(userId, userId, 600)}`,
        'content-type': 'application/json',
        'x-blackout-capabilities': capabilities.join(','),
    };
}

// ---------------------------------------------------------------------------
// SEC-1 — the request header may not self-grant admin.* / cross-domain wildcards
// ---------------------------------------------------------------------------

test('SEC-1: x-blackout-capabilities: admin.* does NOT grant a domain write', async () => {
    const res = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: headersFor('attacker-admin', ['admin.*']),
        body: JSON.stringify({ communityId: 'community-1', title: 'Should be denied' }),
    });
    assert.equal(res.status, 403, 'admin.* asserted via header must not confer governance.write');
});

test('SEC-1: a concrete per-domain header capability still works', async () => {
    const res = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: headersFor('legit-proposer', ['governance.write']),
        body: JSON.stringify({ communityId: 'community-1', title: 'Allowed' }),
    });
    assert.equal(res.status, 201);
});

// ---------------------------------------------------------------------------
// SEC-2 — governance identity is bound to the authenticated session
// ---------------------------------------------------------------------------

test('SEC-2: proposer is bound to the authenticated subject, not the body', async () => {
    const res = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: headersFor('real-proposer', ['governance.write']),
        body: JSON.stringify({
            communityId: 'community-1',
            proposerId: 'victim-impersonated',
            title: 'Identity binding',
        }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { proposerId: string };
    assert.equal(body.proposerId, 'real-proposer', 'body proposerId must be ignored');
});

test('SEC-2/3: votes are keyed to the subject; a second vote (any body userId) is rejected', async () => {
    const proposer = headersFor('vote-proposer', ['governance.write']);
    const created = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: proposer,
        body: JSON.stringify({ communityId: 'community-1', title: 'Vote binding' }),
    });
    const { id: voteId } = (await created.json()) as { id: string };

    const voter = headersFor('single-voter', ['governance.write']);
    const first = await app.request('/v1/governance/votes', {
        method: 'POST',
        headers: voter,
        body: JSON.stringify({ voteId, userId: 'spoofed-a', choice: 'yes' }),
    });
    assert.equal(first.status, 200);

    // Same authenticated voter, different spoofed body userId — still one ballot.
    const second = await app.request('/v1/governance/votes', {
        method: 'POST',
        headers: voter,
        body: JSON.stringify({ voteId, userId: 'spoofed-b', choice: 'no' }),
    });
    assert.equal(
        second.status,
        400,
        'the vote is keyed to the session subject, not the body userId'
    );
});

// ---------------------------------------------------------------------------
// A-1 / SEC-3 — proposal resolution is idempotent and closes the proposal
// ---------------------------------------------------------------------------

test('A-1: resolving a proposal is idempotent and closes it; late votes are rejected', async () => {
    const proposer = headersFor('resolve-proposer', ['governance.write', 'governance.read']);
    const created = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: proposer,
        body: JSON.stringify({ communityId: 'community-1', title: 'Resolve once' }),
    });
    const { id: voteId } = (await created.json()) as { id: string };

    await app.request('/v1/governance/votes', {
        method: 'POST',
        headers: headersFor('voter-1', ['governance.write']),
        body: JSON.stringify({ voteId, choice: 'yes' }),
    });

    const r1 = await app.request(`/v1/governance/proposals/${voteId}/resolve`, {
        method: 'POST',
        headers: proposer,
    });
    assert.equal(r1.status, 200);
    const res1 = (await r1.json()) as { resolvedAt: string; result: string | null };

    const r2 = await app.request(`/v1/governance/proposals/${voteId}/resolve`, {
        method: 'POST',
        headers: proposer,
    });
    assert.equal(r2.status, 200);
    const res2 = (await r2.json()) as { resolvedAt: string; result: string | null };
    assert.equal(res2.resolvedAt, res1.resolvedAt, 're-resolving must return the same resolution');

    const proposal = await app.request(`/v1/governance/proposals/${voteId}`, { headers: proposer });
    assert.equal(((await proposal.json()) as { status: string }).status, 'closed');

    const lateVote = await app.request('/v1/governance/votes', {
        method: 'POST',
        headers: headersFor('late-voter', ['governance.write']),
        body: JSON.stringify({ voteId, choice: 'no' }),
    });
    assert.equal(lateVote.status, 409, 'voting after resolution must be rejected');
});

// ---------------------------------------------------------------------------
// SEC-18 — outbound webhook SSRF host filter covers private/link-local space
// ---------------------------------------------------------------------------

test('SEC-18: isBlockedHost rejects private / link-local / metadata targets', () => {
    const blocked = [
        'localhost',
        'foo.internal',
        'bar.local',
        '127.0.0.1',
        '0.0.0.0',
        '10.1.2.3',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.1.1',
        '169.254.169.254', // cloud metadata
        '100.64.0.1', // CGNAT
        '::1',
        '[::1]',
        'fe80::1',
        'fd00::1234',
        '::ffff:10.0.0.1', // IPv4-mapped private
    ];
    for (const host of blocked) {
        assert.equal(isBlockedHost(host), true, `expected blocked: ${host}`);
    }

    const allowed = [
        '203.0.113.9',
        '8.8.8.8',
        'example.com',
        '172.32.0.1',
        '100.128.0.1',
        '2606:4700::1',
    ];
    for (const host of allowed) {
        assert.equal(isBlockedHost(host), false, `expected allowed: ${host}`);
    }
});
