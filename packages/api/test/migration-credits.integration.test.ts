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
    const username = `mig-user-${suffix}`;
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

test('migration credits: issue is idempotent on (userId, sourceKind, handle)', async () => {
    resetGrowthForTest();
    const user = await issueToken();
    const headers = buildHeaders(user.token, ['growth.read', 'growth.write']);

    const first = await app.request('/v1/growth/migration-credits', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            sourceKind: 'discord_migration',
            sourceHandle: 'alpha',
            valueCents: 1000,
        }),
    });
    assert.equal(first.status, 201);
    const firstBody = (await first.json()) as { credit: { id: string; valueCents: number } };
    assert.equal(firstBody.credit.valueCents, 1000);

    const second = await app.request('/v1/growth/migration-credits', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            sourceKind: 'discord_migration',
            sourceHandle: 'alpha',
            valueCents: 9999,
        }),
    });
    assert.equal(second.status, 201);
    const secondBody = (await second.json()) as { credit: { id: string; valueCents: number } };
    // Idempotent: same record, original valueCents preserved.
    assert.equal(secondBody.credit.id, firstBody.credit.id);
    assert.equal(secondBody.credit.valueCents, 1000);
});

test('migration credits: list mine + redeem flips redeemedAt', async () => {
    resetGrowthForTest();
    const user = await issueToken();
    const headers = buildHeaders(user.token, ['growth.read', 'growth.write']);

    const issued = await app.request('/v1/growth/migration-credits', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            sourceKind: 'twitch_migration',
            valueCents: 500,
        }),
    });
    const { credit } = (await issued.json()) as { credit: { id: string; redeemedAt: string | null } };
    assert.equal(credit.redeemedAt, null);

    const list = await app.request('/v1/growth/migration-credits/me', { headers });
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as { items: { id: string }[] };
    assert.equal(listBody.items.length, 1);

    const redeemed = await app.request(
        `/v1/growth/migration-credits/${credit.id}/redeem`,
        { method: 'POST', headers },
    );
    assert.equal(redeemed.status, 200);
    const redeemedBody = (await redeemed.json()) as { credit: { redeemedAt: string | null } };
    assert.ok(redeemedBody.credit.redeemedAt);

    // Re-redeem returns the same record (idempotent).
    const recheck = await app.request(
        `/v1/growth/migration-credits/${credit.id}/redeem`,
        { method: 'POST', headers },
    );
    assert.equal(recheck.status, 200);
});

test('migration credits: redeem rejects another user', async () => {
    resetGrowthForTest();
    const owner = await issueToken();
    const intruder = await issueToken();
    const ownerHeaders = buildHeaders(owner.token, ['growth.read', 'growth.write']);
    const intruderHeaders = buildHeaders(intruder.token, ['growth.read', 'growth.write']);

    const issued = await app.request('/v1/growth/migration-credits', {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ sourceKind: 'campaign', valueCents: 200 }),
    });
    const { credit } = (await issued.json()) as { credit: { id: string } };

    const stolen = await app.request(
        `/v1/growth/migration-credits/${credit.id}/redeem`,
        { method: 'POST', headers: intruderHeaders },
    );
    assert.equal(stolen.status, 404);
});

test('migration credits: validates negative values', async () => {
    resetGrowthForTest();
    const user = await issueToken();
    const headers = buildHeaders(user.token, ['growth.read', 'growth.write']);
    const response = await app.request('/v1/growth/migration-credits', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sourceKind: 'campaign', valueCents: -1 }),
    });
    assert.equal(response.status, 400);
});
