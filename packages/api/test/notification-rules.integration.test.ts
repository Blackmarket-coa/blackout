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
const { __resetNotificationRulesForTests } = await import('../src/routes/notifications');

function authHeaders(userId: string) {
    return {
        authorization: `Bearer ${signJwt(
            userId,
            userId.replace(/[^a-z0-9]/gi, '') || 'user',
            600
        )}`,
        'content-type': 'application/json',
    };
}

const RULE = {
    feature: 'mentions',
    category: 'room',
    hardCapPerDay: 50,
    cooldownMinutes: 5,
};

test('rules endpoints require authentication', async () => {
    __resetNotificationRulesForTests();
    const response = await app.request('/v1/notifications/rules');
    assert.equal(response.status, 401);
});

test('upsert + list round-trip; PUT is idempotent per key', async () => {
    __resetNotificationRulesForTests();
    const put = await app.request('/v1/notifications/rules/mentions/room', {
        method: 'PUT',
        headers: authHeaders('rules-user-a'),
        body: JSON.stringify(RULE),
    });
    assert.equal(put.status, 200);

    // Same key again with a different cap replaces rather than duplicates.
    await app.request('/v1/notifications/rules/mentions/room', {
        method: 'PUT',
        headers: authHeaders('rules-user-a'),
        body: JSON.stringify({ ...RULE, hardCapPerDay: 10 }),
    });

    const list = await app.request('/v1/notifications/rules', {
        headers: authHeaders('rules-user-a'),
    });
    const body = (await list.json()) as {
        subject: string;
        rules: Array<{ hardCapPerDay: number }>;
    };
    assert.equal(body.rules.length, 1);
    assert.equal(body.rules[0]!.hardCapPerDay, 10);
});

test('room-scoped rule coexists with the category-wide rule', async () => {
    __resetNotificationRulesForTests();
    const headers = authHeaders('rules-user-b');
    await app.request('/v1/notifications/rules/mentions/room', {
        method: 'PUT',
        headers,
        body: JSON.stringify(RULE),
    });
    await app.request('/v1/notifications/rules/mentions/room', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...RULE, roomId: '!busy:example.org', hardCapPerDay: 3 }),
    });

    const list = await app.request('/v1/notifications/rules', { headers });
    const body = (await list.json()) as { rules: Array<{ roomId?: string }> };
    assert.equal(body.rules.length, 2);
    assert.deepEqual(
        body.rules.map((rule) => rule.roomId).sort((a, b) => String(a).localeCompare(String(b))),
        ['!busy:example.org', undefined]
    );
});

test('deleting a room override leaves the category-wide rule intact (and vice versa)', async () => {
    __resetNotificationRulesForTests();
    const headers = authHeaders('rules-user-c');
    await app.request('/v1/notifications/rules/mentions/room', {
        method: 'PUT',
        headers,
        body: JSON.stringify(RULE),
    });
    await app.request('/v1/notifications/rules/mentions/room', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...RULE, roomId: '!busy:example.org' }),
    });

    const deleteScoped = await app.request(
        `/v1/notifications/rules/mentions/room?roomId=${encodeURIComponent('!busy:example.org')}`,
        { method: 'DELETE', headers }
    );
    assert.equal(deleteScoped.status, 204);

    const afterScopedDelete = (await (
        await app.request('/v1/notifications/rules', { headers })
    ).json()) as { rules: Array<{ roomId?: string }> };
    assert.equal(afterScopedDelete.rules.length, 1);
    assert.equal(afterScopedDelete.rules[0]!.roomId, undefined);

    const deleteWide = await app.request('/v1/notifications/rules/mentions/room', {
        method: 'DELETE',
        headers,
    });
    assert.equal(deleteWide.status, 204);
    const empty = (await (await app.request('/v1/notifications/rules', { headers })).json()) as {
        rules: unknown[];
    };
    assert.equal(empty.rules.length, 0);
});

test('DELETE of a missing rule 404s; body/path mismatch 400s; rules are per-subject', async () => {
    __resetNotificationRulesForTests();
    const headers = authHeaders('rules-user-d');

    const missing = await app.request('/v1/notifications/rules/mentions/room', {
        method: 'DELETE',
        headers,
    });
    assert.equal(missing.status, 404);

    const mismatch = await app.request('/v1/notifications/rules/mentions/room', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...RULE, feature: 'reactions' }),
    });
    assert.equal(mismatch.status, 400);

    await app.request('/v1/notifications/rules/mentions/room', {
        method: 'PUT',
        headers,
        body: JSON.stringify(RULE),
    });
    const otherUser = (await (
        await app.request('/v1/notifications/rules', { headers: authHeaders('rules-user-e') })
    ).json()) as { rules: unknown[] };
    assert.equal(otherUser.rules.length, 0);
});

test('quiet hours validate as HH:MM', async () => {
    __resetNotificationRulesForTests();
    const headers = authHeaders('rules-user-f');
    const bad = await app.request('/v1/notifications/rules/mentions/room', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...RULE, quietHours: { startUtc: '25:99', endUtc: '07:00' } }),
    });
    assert.equal(bad.status, 400);

    const good = await app.request('/v1/notifications/rules/mentions/room', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...RULE, quietHours: { startUtc: '22:00', endUtc: '07:00' } }),
    });
    assert.equal(good.status, 200);
});
