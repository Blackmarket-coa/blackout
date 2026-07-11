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
const { __resetMjolnirStoreForTests } = await import('../src/modules/moderationMjolnir');

function authHeaders(userId: string) {
    return {
        authorization: `Bearer ${signJwt(userId, userId.replace(/[^a-z0-9]/gi, '') || 'mod', 600)}`,
        'content-type': 'application/json',
        'x-blackout-capabilities': 'moderation.read,moderation.write',
    };
}

type Snapshot = {
    listId: string;
    label: string;
    subscribed: boolean;
    rules: Array<{ ruleId: string; entity: string; recommendation: string; updatedAt: string }>;
};

test('banlists require authentication and moderation capability', async () => {
    __resetMjolnirStoreForTests();
    const anonymous = await app.request('/v1/moderation/mjolnir/banlists');
    assert.equal(anonymous.status, 401);
});

test('banlists seed a personal list plus a subscribable community list', async () => {
    __resetMjolnirStoreForTests();
    const response = await app.request('/v1/moderation/mjolnir/banlists', {
        headers: authHeaders('mod-user-a'),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { subject: string; lists: Snapshot[] };
    const ids = body.lists.map((list) => list.listId).sort();
    assert.deepEqual(ids, ['community-baseline', 'personal']);
    const personal = body.lists.find((list) => list.listId === 'personal')!;
    assert.equal(personal.subscribed, true);
    assert.equal(personal.rules.length, 0);
    const baseline = body.lists.find((list) => list.listId === 'community-baseline')!;
    assert.equal(baseline.subscribed, false);
    assert.equal(baseline.rules.length, 2);
});

test('rule add/remove round-trip emits banlist-changed envelopes', async () => {
    __resetMjolnirStoreForTests();
    const headers = authHeaders('mod-user-b');

    const added = await app.request('/v1/moderation/mjolnir/banlists/personal/rules', {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'user', entity: '@abuse:example.org', reason: 'spam' }),
    });
    assert.equal(added.status, 200);
    const envelope = (await added.json()) as {
        event: string;
        payload: { op: string; listId: string; rule: { ruleId: string; recommendation: string } };
    };
    assert.equal(envelope.event, 'blackout.moderation.mjolnir.banlist.changed');
    assert.equal(envelope.payload.op, 'created');
    assert.equal(envelope.payload.listId, 'personal');
    assert.equal(envelope.payload.rule.recommendation, 'ban');

    const listed = (await (
        await app.request('/v1/moderation/mjolnir/banlists', { headers })
    ).json()) as { lists: Snapshot[] };
    const personal = listed.lists.find((list) => list.listId === 'personal')!;
    assert.equal(personal.rules.length, 1);
    assert.equal(personal.rules[0]!.entity, '@abuse:example.org');

    const removed = await app.request(
        `/v1/moderation/mjolnir/banlists/personal/rules/${envelope.payload.rule.ruleId}`,
        { method: 'DELETE', headers }
    );
    assert.equal(removed.status, 200);
    const removal = (await removed.json()) as {
        payload: { op: string; removedRuleId: string };
    };
    assert.equal(removal.payload.op, 'removed');
    assert.equal(removal.payload.removedRuleId, envelope.payload.rule.ruleId);

    const after = (await (
        await app.request('/v1/moderation/mjolnir/banlists', { headers })
    ).json()) as { lists: Snapshot[] };
    assert.equal(after.lists.find((list) => list.listId === 'personal')!.rules.length, 0);
});

test('subscribe / unsubscribe toggles, personal list is not unsubscribable', async () => {
    __resetMjolnirStoreForTests();
    const headers = authHeaders('mod-user-c');

    const subscribed = await app.request(
        '/v1/moderation/mjolnir/banlists/community-baseline/subscribe',
        { method: 'POST', headers, body: '{}' }
    );
    assert.equal(subscribed.status, 200);
    assert.equal(((await subscribed.json()) as Snapshot).subscribed, true);

    const unsubscribed = await app.request(
        '/v1/moderation/mjolnir/banlists/community-baseline/subscribe',
        { method: 'DELETE', headers }
    );
    assert.equal(((await unsubscribed.json()) as Snapshot).subscribed, false);

    const personal = await app.request('/v1/moderation/mjolnir/banlists/personal/subscribe', {
        method: 'DELETE',
        headers,
    });
    assert.equal(personal.status, 400);

    const missing = await app.request('/v1/moderation/mjolnir/banlists/nope/subscribe', {
        method: 'POST',
        headers,
        body: '{}',
    });
    assert.equal(missing.status, 404);
});

test('protections directory lists the seeds; PUT toggles and merges settings', async () => {
    __resetMjolnirStoreForTests();
    const headers = authHeaders('mod-user-d');

    const listed = (await (
        await app.request('/v1/moderation/mjolnir/protections', { headers })
    ).json()) as { protections: Array<{ id: string; enabled: boolean }> };
    assert.deepEqual(listed.protections.map((p) => p.id).sort(), [
        'BasicFloodingProtection',
        'JoinWaveShortCircuit',
        'MentionSpam',
    ]);
    assert.ok(listed.protections.every((p) => p.enabled === false));

    const toggled = await app.request(
        '/v1/moderation/mjolnir/protections/BasicFloodingProtection',
        {
            method: 'PUT',
            headers,
            body: JSON.stringify({ enabled: true, settings: { maxPerMinute: 4 } }),
        }
    );
    assert.equal(toggled.status, 200);
    const envelope = (await toggled.json()) as {
        event: string;
        payload: { protectionId: string; enabled: boolean; settings: Record<string, unknown> };
    };
    assert.equal(envelope.event, 'blackout.moderation.mjolnir.protection.changed');
    assert.equal(envelope.payload.enabled, true);
    assert.equal(envelope.payload.settings.maxPerMinute, 4);

    const unknown = await app.request('/v1/moderation/mjolnir/protections/NotAProtection', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ enabled: true }),
    });
    assert.equal(unknown.status, 404);
});

test('state is per-subject', async () => {
    __resetMjolnirStoreForTests();
    await app.request('/v1/moderation/mjolnir/banlists/personal/rules', {
        method: 'POST',
        headers: authHeaders('mod-user-e'),
        body: JSON.stringify({ kind: 'server', entity: '*.bad.example', reason: 'raids' }),
    });

    const other = (await (
        await app.request('/v1/moderation/mjolnir/banlists', { headers: authHeaders('mod-user-f') })
    ).json()) as { lists: Snapshot[] };
    assert.equal(other.lists.find((list) => list.listId === 'personal')!.rules.length, 0);
});
