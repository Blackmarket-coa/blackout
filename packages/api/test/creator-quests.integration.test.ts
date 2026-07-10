import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { default: app } = await import('../src/index');
const { questsService } = await import('../src/services/growth');

async function issueToken(): Promise<{ token: string; userId: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const response = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: `quests-user-${suffix}`,
            email: `quests-user-${suffix}@example.com`,
            password: 'test-password',
        }),
    });
    assert.equal(response.status, 201);
    return (await response.json()) as { token: string; userId: string };
}

const headersFor = (token: string) => ({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-blackout-capabilities': 'growth.read,growth.write',
});

const questBody = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
        sourceKind: 'creator',
        title: 'Share your first clip',
        description: 'Post a clip from any of my replays',
        rewardKind: 'fbm_credit',
        rewardCents: 100,
        ...overrides,
    });

void test('a creator quest is stamped with the authoring creator', async () => {
    const { token, userId } = await issueToken();
    const response = await app.request('/v1/growth/quests', {
        method: 'POST',
        headers: headersFor(token),
        // A spoofed sourceRef must be overwritten with the caller.
        body: questBody({ sourceRef: '@someone-else:test' }),
    });
    assert.equal(response.status, 201);
    const { quest } = (await response.json()) as {
        quest: { sourceKind: string; sourceRef: string };
    };
    assert.equal(quest.sourceKind, 'creator');
    assert.equal(quest.sourceRef, userId);
});

void test('non-admins cannot author system or canopy quests', async () => {
    const { token } = await issueToken();
    for (const sourceKind of ['system', 'canopy']) {
        const response = await app.request('/v1/growth/quests', {
            method: 'POST',
            headers: headersFor(token),
            body: questBody({ sourceKind }),
        });
        assert.equal(response.status, 403, `expected 403 for ${sourceKind}`);
        assert.equal(((await response.json()) as { code: string }).code, 'admin_required');
    }
});

void test('quests/mine lists own quests with completion counts', async () => {
    const creator = await issueToken();
    const fan = await issueToken();

    const created = await app.request('/v1/growth/quests', {
        method: 'POST',
        headers: headersFor(creator.token),
        body: questBody({ title: 'Countable quest' }),
    });
    const { quest } = (await created.json()) as { quest: { id: string } };

    const completed = await app.request(`/v1/growth/quests/${quest.id}/complete`, {
        method: 'POST',
        headers: headersFor(fan.token),
    });
    assert.equal(completed.status, 201);

    const mine = await app.request('/v1/growth/quests/mine', {
        headers: headersFor(creator.token),
    });
    assert.equal(mine.status, 200);
    const { items } = (await mine.json()) as {
        items: Array<{ id: string; completions: number }>;
    };
    const row = items.find((item) => item.id === quest.id);
    assert.ok(row, 'expected the created quest in /quests/mine');
    assert.equal(row!.completions, 1);

    // Another creator's /mine must not include it.
    const other = await app.request('/v1/growth/quests/mine', {
        headers: headersFor(fan.token),
    });
    const otherItems = (await other.json()) as { items: Array<{ id: string }> };
    assert.ok(!otherItems.items.some((item) => item.id === quest.id));
});

void test('ending a quest removes it from active listings; strangers cannot end it', async () => {
    const creator = await issueToken();
    const stranger = await issueToken();

    const created = await app.request('/v1/growth/quests', {
        method: 'POST',
        headers: headersFor(creator.token),
        body: questBody({ title: 'Endable quest' }),
    });
    const { quest } = (await created.json()) as { quest: { id: string } };

    const denied = await app.request(`/v1/growth/quests/${quest.id}/end`, {
        method: 'POST',
        headers: headersFor(stranger.token),
    });
    assert.equal(denied.status, 403);

    const ended = await app.request(`/v1/growth/quests/${quest.id}/end`, {
        method: 'POST',
        headers: headersFor(creator.token),
    });
    assert.equal(ended.status, 200);
    const endedQuest = (await ended.json()) as { quest: { endsAt: string | null } };
    assert.ok(endedQuest.quest.endsAt);

    const active = await app.request('/v1/growth/quests?sourceKind=creator', {
        headers: headersFor(creator.token),
    });
    const activeItems = (await active.json()) as { items: Array<{ id: string }> };
    assert.ok(!activeItems.items.some((item) => item.id === quest.id));

    // Idempotent end via the service, and history is preserved.
    assert.equal(questsService.end(quest.id).id, quest.id);
});
