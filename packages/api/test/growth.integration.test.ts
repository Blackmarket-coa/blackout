import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { resetGrowthForTest } = await import('../src/services/growth');

async function issueToken(): Promise<{ token: string; sub: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const username = `growth-user-${suffix}`;
    const response = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username,
            email: `${username}@example.com`,
            password: 'test-password',
        }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { token: string; userId: string };
    return { token: body.token, sub: body.userId };
}

const buildHeaders = (token: string, capabilities: string[]) => ({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-blackout-capabilities': capabilities.join(','),
});

test('growth referrals: create + list mine + dedupe by referee + reject self-referral', async () => {
    resetGrowthForTest();
    const referrer = await issueToken();
    const headers = buildHeaders(referrer.token, ['growth.read', 'growth.write']);

    const created = await app.request('/v1/growth/referrals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ refereeUserId: 'referee-1', sourceKind: 'invite_link' }),
    });
    assert.equal(created.status, 201);
    const createdBody = (await created.json()) as {
        referral: { id: string; refereeUserId: string };
    };
    assert.equal(createdBody.referral.refereeUserId, 'referee-1');

    // Re-clicking the same invite link returns the existing record.
    const dup = await app.request('/v1/growth/referrals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ refereeUserId: 'referee-1' }),
    });
    assert.equal(dup.status, 201);
    const dupBody = (await dup.json()) as { referral: { id: string } };
    assert.equal(dupBody.referral.id, createdBody.referral.id);

    // Self-referral rejected.
    const selfRef = await app.request('/v1/growth/referrals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ refereeUserId: referrer.sub }),
    });
    assert.equal(selfRef.status, 400);

    // List mine.
    const list = await app.request('/v1/growth/referrals/me', { headers });
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as { items: unknown[] };
    assert.equal(listBody.items.length, 1);
});

test('growth ambassadors: apply + read me + idempotent on retry', async () => {
    resetGrowthForTest();
    const user = await issueToken();
    const headers = buildHeaders(user.token, ['growth.read', 'growth.write']);

    const me0 = await app.request('/v1/growth/ambassadors/me', { headers });
    assert.equal(me0.status, 200);
    const me0Body = (await me0.json()) as { ambassador: unknown };
    assert.equal(me0Body.ambassador, null);

    const apply = await app.request('/v1/growth/ambassadors/apply', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tier: 'sapling' }),
    });
    assert.equal(apply.status, 201);
    const applyBody = (await apply.json()) as {
        ambassador: { id: string; tier: string; commissionBps: number; status: string };
    };
    assert.equal(applyBody.ambassador.tier, 'sapling');
    assert.equal(applyBody.ambassador.commissionBps, 200);
    assert.equal(applyBody.ambassador.status, 'pending');

    // Reapply returns the same record.
    const reapply = await app.request('/v1/growth/ambassadors/apply', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tier: 'canopy' }),
    });
    assert.equal(reapply.status, 201);
    const reapplyBody = (await reapply.json()) as { ambassador: { id: string } };
    assert.equal(reapplyBody.ambassador.id, applyBody.ambassador.id);

    const me1 = await app.request('/v1/growth/ambassadors/me', { headers });
    assert.equal(me1.status, 200);
    const me1Body = (await me1.json()) as { ambassador: { id: string } };
    assert.equal(me1Body.ambassador.id, applyBody.ambassador.id);
});

test('growth quests: create + list active + complete + dedupe completion', async () => {
    resetGrowthForTest();
    const author = await issueToken();
    const player = await issueToken();
    const writeHeaders = buildHeaders(author.token, ['growth.read', 'growth.write']);
    const playerHeaders = buildHeaders(player.token, ['growth.read', 'growth.write']);

    const create = await app.request('/v1/growth/quests', {
        method: 'POST',
        headers: writeHeaders,
        body: JSON.stringify({
            sourceKind: 'system',
            title: 'Welcome streak',
            description: 'Sign in three days in a row',
            rewardKind: 'tip',
            rewardCents: 500,
        }),
    });
    assert.equal(create.status, 201);
    const createBody = (await create.json()) as { quest: { id: string; rewardCents: number } };
    assert.equal(createBody.quest.rewardCents, 500);

    const list = await app.request('/v1/growth/quests', { headers: playerHeaders });
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as { items: { id: string }[] };
    assert.ok(listBody.items.some((item) => item.id === createBody.quest.id));

    const complete = await app.request(
        `/v1/growth/quests/${createBody.quest.id}/complete`,
        { method: 'POST', headers: playerHeaders },
    );
    assert.equal(complete.status, 201);
    const completeBody = (await complete.json()) as {
        completion: { id: string; questId: string };
    };
    assert.equal(completeBody.completion.questId, createBody.quest.id);

    // Re-completing returns the same record (idempotent).
    const recomplete = await app.request(
        `/v1/growth/quests/${createBody.quest.id}/complete`,
        { method: 'POST', headers: playerHeaders },
    );
    assert.equal(recomplete.status, 201);
    const recompleteBody = (await recomplete.json()) as { completion: { id: string } };
    assert.equal(recompleteBody.completion.id, completeBody.completion.id);

    // Listing completions for the player includes this one.
    const completions = await app.request('/v1/growth/quests/me/completions', {
        headers: playerHeaders,
    });
    assert.equal(completions.status, 200);
    const completionsBody = (await completions.json()) as { items: unknown[] };
    assert.equal(completionsBody.items.length, 1);
});

test('growth quests: 404 on completing missing quest', async () => {
    resetGrowthForTest();
    const user = await issueToken();
    const headers = buildHeaders(user.token, ['growth.read', 'growth.write']);
    const response = await app.request('/v1/growth/quests/no-such-id/complete', {
        method: 'POST',
        headers,
    });
    assert.equal(response.status, 404);
});

test('growth endpoints reject callers without growth capability', async () => {
    resetGrowthForTest();
    const user = await issueToken();
    const headers = buildHeaders(user.token, []);
    const response = await app.request('/v1/growth/referrals/me', { headers });
    assert.equal(response.status, 403);
});
