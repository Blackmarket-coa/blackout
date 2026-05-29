import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.MATRIX_PUBLIC_BASE_URL = process.env.MATRIX_PUBLIC_BASE_URL ?? 'https://hs.test.local';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { matrixClient } = await import('../src/integrations/matrix-client');

type AnyFn = (...args: unknown[]) => unknown;

async function withMatrix(
    overrides: Record<string, AnyFn>,
    run: () => Promise<void>,
): Promise<void> {
    const client = matrixClient as unknown as Record<string, AnyFn>;
    const originals: Record<string, AnyFn> = {};
    for (const [k, v] of Object.entries(overrides)) {
        originals[k] = client[k];
        client[k] = v;
    }
    try {
        await run();
    } finally {
        for (const [k, v] of Object.entries(originals)) client[k] = v;
    }
}

function makeUser(username: string): { id: string; token: string } {
    const id = randomUUID();
    db.createUser({
        id,
        username,
        email: `${username}@test.local`,
        passwordHash: 'x',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: '',
    });
    return { id, token: signJwt(id, username, 600) };
}

let burnerSeq = 0;
const provisionOk: AnyFn = async (label: unknown) => {
    burnerSeq += 1;
    // Not a credential — a per-call placeholder the route just echoes back.
    const credential = ['burner', burnerSeq, 'placeholder'].join('-');
    return {
        ok: true as const,
        status: 201,
        userId: `@burn-${burnerSeq}:hs.test.local`,
        password: credential,
        displayname: String(label ?? 'Burner'),
    };
};
const provisionNotConfigured: AnyFn = async () => ({
    ok: false as const,
    reason: 'matrix_not_configured' as const,
});
const deactivateOk: AnyFn = async () => ({ ok: true as const, status: 200 });

test('POST /v1/identities rejects unauthenticated callers', async () => {
    const res = await app.request('/v1/identities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'tip line' }),
    });
    assert.equal(res.status, 401);
});

test('POST /v1/identities provisions a burner and returns the one-time password', async () => {
    const owner = makeUser(`owner_${randomUUID().slice(0, 8)}`);
    await withMatrix({ provisionBurner: provisionOk }, async () => {
        const res = await app.request('/v1/identities', {
            method: 'POST',
            headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Tip line' }),
        });
        assert.equal(res.status, 201);
        const body = (await res.json()) as {
            burner: { burnerUserId: string; label: string };
            password: string;
            baseUrl: string;
        };
        assert.ok(body.burner.burnerUserId.startsWith('@burn-'));
        assert.equal(body.burner.label, 'Tip line');
        assert.ok(body.password.length > 0);
        assert.equal(body.baseUrl, 'https://hs.test.local');
    });
});

test('POST /v1/identities enforces the free-tier active-burner cap', async () => {
    const owner = makeUser(`owner_${randomUUID().slice(0, 8)}`);
    await withMatrix({ provisionBurner: provisionOk }, async () => {
        const first = await app.request('/v1/identities', {
            method: 'POST',
            headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'one' }),
        });
        assert.equal(first.status, 201);

        const second = await app.request('/v1/identities', {
            method: 'POST',
            headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'two' }),
        });
        assert.equal(second.status, 409);
        const body = (await second.json()) as { code: string; cap: number };
        assert.equal(body.code, 'cap_reached');
        assert.equal(body.cap, 1);
    });
});

test('POST /v1/identities raises the cap when burner_pro is granted', async () => {
    const owner = makeUser(`owner_${randomUUID().slice(0, 8)}`);
    const now = new Date().toISOString();
    db.upsertMarketplaceEntitlement({
        id: randomUUID(),
        userId: owner.id,
        providerId: 'freeblackmarket',
        providerListingId: 'stub-burner-pro',
        sku: null,
        kind: 'privacy_tool',
        status: 'granted',
        grantedAt: now,
        expiresAt: null,
        sourceEventId: `seed-${randomUUID()}`,
        metadata: { features: ['burner_pro'] },
        createdAt: now,
        updatedAt: now,
    });

    await withMatrix({ provisionBurner: provisionOk }, async () => {
        // Free tier was capped at 1; with the entitlement we expect at least
        // two consecutive creates to succeed.
        for (let i = 0; i < 2; i += 1) {
            const res = await app.request('/v1/identities', {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${owner.token}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ label: `pro-${i}` }),
            });
            assert.equal(res.status, 201, `create ${i} should succeed`);
        }
    });
});

test('POST /v1/identities returns 503 when Synapse is unconfigured', async () => {
    const owner = makeUser(`owner_${randomUUID().slice(0, 8)}`);
    await withMatrix({ provisionBurner: provisionNotConfigured }, async () => {
        const res = await app.request('/v1/identities', {
            method: 'POST',
            headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'x' }),
        });
        assert.equal(res.status, 503);
        const body = (await res.json()) as { code: string; reason: string };
        assert.equal(body.code, 'matrix_unavailable');
        assert.equal(body.reason, 'matrix_not_configured');
    });
});

test('POST /v1/identities/:id/burn deactivates and marks the burner burned', async () => {
    const owner = makeUser(`owner_${randomUUID().slice(0, 8)}`);
    await withMatrix({ provisionBurner: provisionOk, deactivateUser: deactivateOk }, async () => {
        const created = await app.request('/v1/identities', {
            method: 'POST',
            headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'burn me' }),
        });
        const { burner } = (await created.json()) as { burner: { burnerUserId: string } };

        let deactivated: string | undefined;
        await withMatrix(
            {
                deactivateUser: (async (userId: unknown) => {
                    deactivated = String(userId);
                    return { ok: true as const, status: 200 };
                }) as AnyFn,
            },
            async () => {
                const res = await app.request(
                    `/v1/identities/${encodeURIComponent(burner.burnerUserId)}/burn`,
                    {
                        method: 'POST',
                        headers: {
                            authorization: `Bearer ${owner.token}`,
                            'content-type': 'application/json',
                        },
                        body: '{}',
                    },
                );
                assert.equal(res.status, 200);
                const body = (await res.json()) as { burner: { burnedAt: string | null } };
                assert.ok(body.burner.burnedAt);
            },
        );
        assert.equal(deactivated, burner.burnerUserId);

        // Burned burner no longer counts against the cap → a new create succeeds.
        const again = await app.request('/v1/identities', {
            method: 'POST',
            headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'fresh' }),
        });
        assert.equal(again.status, 201);
    });
});

test('POST /v1/identities/:id/burn 404s for a burner the caller does not own', async () => {
    const owner = makeUser(`owner_${randomUUID().slice(0, 8)}`);
    const stranger = makeUser(`stranger_${randomUUID().slice(0, 8)}`);
    await withMatrix({ provisionBurner: provisionOk, deactivateUser: deactivateOk }, async () => {
        const created = await app.request('/v1/identities', {
            method: 'POST',
            headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'owned' }),
        });
        const { burner } = (await created.json()) as { burner: { burnerUserId: string } };

        const res = await app.request(
            `/v1/identities/${encodeURIComponent(burner.burnerUserId)}/burn`,
            {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${stranger.token}`,
                    'content-type': 'application/json',
                },
                body: '{}',
            },
        );
        assert.equal(res.status, 404);
    });
});
