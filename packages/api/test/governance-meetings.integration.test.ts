import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { __resetGovernanceStoreForTests } = await import('../src/services/governanceStore');

function authHeaders(capabilities = ['governance.read', 'governance.write']) {
    return {
        authorization: `Bearer ${signJwt('gov-user', 'govuser', 600)}`,
        'content-type': 'application/json',
        'x-blackout-capabilities': capabilities.join(','),
    };
}

const sampleMeeting = (overrides: Partial<Record<string, unknown>> = {}) => ({
    meetingId: 'meet-1',
    title: 'Quarterly Town Hall',
    startsAt: '2026-06-01T15:00:00.000Z',
    endsAt: '2026-06-01T16:00:00.000Z',
    agenda: 'Review Q2 priorities',
    location: 'matrix:room/townhall:example.org',
    attendees: [{ id: '@alice:example.org', label: 'Alice' }],
    relatedProposalId: 'proposal-42',
    status: 'scheduled' as const,
    ...overrides,
});

test('meetings list is empty on a fresh store', async () => {
    __resetGovernanceStoreForTests();
    const response = await app.request('/v1/governance/meetings', { headers: authHeaders() });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { items: unknown[] };
    assert.deepEqual(body.items, []);
});

test('schedule → list → cancel meeting round-trip', async () => {
    __resetGovernanceStoreForTests();
    const headers = authHeaders();

    const put = await app.request('/v1/governance/meetings/meet-1', {
        method: 'PUT',
        headers,
        body: JSON.stringify(sampleMeeting()),
    });
    assert.equal(put.status, 200);
    const scheduled = (await put.json()) as { status: string; event: { type: string } };
    assert.equal(scheduled.status, 'scheduled');
    assert.equal(scheduled.event.type, 'governance.meeting.scheduled');

    const listAll = await app.request('/v1/governance/meetings', { headers });
    const allBody = (await listAll.json()) as { items: Array<{ meetingId: string }> };
    assert.equal(allBody.items.length, 1);
    assert.equal(allBody.items[0]!.meetingId, 'meet-1');

    const filtered = await app.request('/v1/governance/meetings?proposalId=proposal-42', {
        headers,
    });
    const filteredBody = (await filtered.json()) as { items: unknown[] };
    assert.equal(filteredBody.items.length, 1);

    const wrongFilter = await app.request('/v1/governance/meetings?proposalId=other', {
        headers,
    });
    const wrongBody = (await wrongFilter.json()) as { items: unknown[] };
    assert.deepEqual(wrongBody.items, []);

    const cancel = await app.request('/v1/governance/meetings/meet-1', {
        method: 'DELETE',
        headers,
    });
    assert.equal(cancel.status, 200);
    const cancelled = (await cancel.json()) as { status: string };
    assert.equal(cancelled.status, 'cancelled');
});

test('meetings PUT rejects URL/body id mismatch', async () => {
    __resetGovernanceStoreForTests();
    const response = await app.request('/v1/governance/meetings/meet-x', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(sampleMeeting({ meetingId: 'meet-y' })),
    });
    assert.equal(response.status, 400);
});

test('meetings PUT rejects endsAt <= startsAt', async () => {
    __resetGovernanceStoreForTests();
    const response = await app.request('/v1/governance/meetings/meet-bad', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(
            sampleMeeting({
                meetingId: 'meet-bad',
                startsAt: '2026-06-01T16:00:00.000Z',
                endsAt: '2026-06-01T15:00:00.000Z',
            }),
        ),
    });
    assert.equal(response.status, 400);
});

test('meetings DELETE on unknown id returns 404', async () => {
    __resetGovernanceStoreForTests();
    const response = await app.request('/v1/governance/meetings/never-was', {
        method: 'DELETE',
        headers: authHeaders(),
    });
    assert.equal(response.status, 404);
});

test('meetings PUT requires write capability', async () => {
    __resetGovernanceStoreForTests();
    const response = await app.request('/v1/governance/meetings/meet-1', {
        method: 'PUT',
        headers: authHeaders(['governance.read']),
        body: JSON.stringify(sampleMeeting()),
    });
    assert.equal(response.status, 403);
});
