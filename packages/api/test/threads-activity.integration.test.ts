import test from 'node:test';
import assert from 'node:assert/strict';
import type { ThreadActivityUpdatedPayload } from '@blackout/protocol';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { __setThreadActivityForTests, __resetThreadActivityStoreForTests } = await import(
    '../src/services/threadActivityStore'
);

function authHeaders(userId: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(userId, userId.replace(/[^a-z0-9]/gi, '') || 'user', 600)}`,
        'content-type': 'application/json',
    };
}

type ListResponse = { subject: string; activities: ThreadActivityUpdatedPayload[] };

test('GET /v1/threads/activity requires a signed-in user', async () => {
    const response = await app.request('/v1/threads/activity');
    assert.equal(response.status, 401);
});

test('GET /v1/threads/activity returns an empty inbox for a fresh subject', async () => {
    __resetThreadActivityStoreForTests();
    const userId = '@thread-user-a:server';
    const response = await app.request('/v1/threads/activity?limit=50', {
        headers: authHeaders(userId),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as ListResponse;
    assert.equal(body.subject, userId);
    assert.deepEqual(body.activities, []);
});

test('GET /v1/threads/activity returns unread entries newest-first, honoring limit', async () => {
    __resetThreadActivityStoreForTests();
    const userId = '@thread-user-b:server';
    __setThreadActivityForTests(userId, [
        {
            activityId: 'older',
            threadRootEventId: '$root1',
            roomId: '!room:server',
            kind: 'thread_replied',
            unreadCount: 2,
            occurredAt: '2026-05-01T00:00:00.000Z',
        },
        {
            activityId: 'newer',
            threadRootEventId: '$root2',
            roomId: '!room:server',
            kind: 'thread_started',
            unreadCount: 1,
            occurredAt: '2026-05-10T00:00:00.000Z',
        },
        {
            activityId: 'resolved',
            threadRootEventId: '$root3',
            roomId: '!room:server',
            kind: 'thread_resolved',
            unreadCount: 0,
            occurredAt: '2026-05-12T00:00:00.000Z',
        },
    ]);

    const response = await app.request('/v1/threads/activity?limit=1', {
        headers: authHeaders(userId),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as ListResponse;
    assert.equal(body.activities.length, 1);
    assert.equal(body.activities[0].activityId, 'newer');
});

test('POST /v1/threads/activity/:id/read marks the entry read and returns an envelope', async () => {
    __resetThreadActivityStoreForTests();
    const userId = '@thread-user-c:server';
    __setThreadActivityForTests(userId, [
        {
            activityId: 'a1',
            threadRootEventId: '$root',
            roomId: '!room:server',
            kind: 'thread_replied',
            unreadCount: 4,
            occurredAt: '2026-05-01T00:00:00.000Z',
        },
    ]);

    const read = await app.request('/v1/threads/activity/a1/read', {
        method: 'POST',
        headers: authHeaders(userId),
        body: JSON.stringify({}),
    });
    assert.equal(read.status, 200);
    const event = (await read.json()) as {
        event: string;
        senderId: string;
        payload: ThreadActivityUpdatedPayload;
    };
    assert.equal(event.event, 'blackout.thread.activity.updated');
    assert.equal(event.senderId, userId);
    assert.equal(event.payload.activityId, 'a1');
    assert.equal(event.payload.unreadCount, 0);

    // The entry is now read, so the inbox drops it.
    const list = await app.request('/v1/threads/activity', { headers: authHeaders(userId) });
    const body = (await list.json()) as ListResponse;
    assert.deepEqual(body.activities, []);
});

test('POST /v1/threads/activity/:id/read is idempotent for unknown ids', async () => {
    __resetThreadActivityStoreForTests();
    const userId = '@thread-user-d:server';
    const read = await app.request('/v1/threads/activity/does-not-exist/read', {
        method: 'POST',
        headers: authHeaders(userId),
        body: JSON.stringify({}),
    });
    assert.equal(read.status, 200);
    const event = (await read.json()) as { payload: ThreadActivityUpdatedPayload };
    assert.equal(event.payload.activityId, 'does-not-exist');
    assert.equal(event.payload.unreadCount, 0);
});
