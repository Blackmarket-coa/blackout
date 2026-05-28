import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { perturbationClient } = await import('../src/integrations/perturbation-client');

type AnyFn = (...args: unknown[]) => unknown;

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

const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('POST /v1/media/perturb rejects unauthenticated callers', async () => {
    const res = await app.request('/v1/media/perturb', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mimetype: 'image/png', image: tinyPngBase64 }),
    });
    assert.equal(res.status, 401);
});

test('POST /v1/media/perturb returns 503 when the sidecar is not configured', async () => {
    const user = makeUser(`u_${randomUUID().slice(0, 8)}`);
    // PERTURBATION_SERVICE_URL is unset in the test env → not_configured.
    const res = await app.request('/v1/media/perturb', {
        method: 'POST',
        headers: { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ mimetype: 'image/png', image: tinyPngBase64 }),
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'perturbation_unavailable');
});

test('POST /v1/media/perturb returns the perturbed image on success', async () => {
    const user = makeUser(`u_${randomUUID().slice(0, 8)}`);
    const client = perturbationClient as unknown as Record<string, AnyFn>;
    const original = client.perturb;
    client.perturb = (async (image: unknown, mimetype: unknown) => ({
        ok: true as const,
        image: `perturbed:${String(image).slice(0, 4)}`,
        mimetype: String(mimetype),
    })) as AnyFn;
    try {
        const res = await app.request('/v1/media/perturb', {
            method: 'POST',
            headers: { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ mimetype: 'image/png', image: tinyPngBase64 }),
        });
        assert.equal(res.status, 200);
        const body = (await res.json()) as { image: string; mimetype: string };
        assert.ok(body.image.startsWith('perturbed:'));
        assert.equal(body.mimetype, 'image/png');
    } finally {
        client.perturb = original;
    }
});

test('POST /v1/media/perturb rejects unsupported mimetypes', async () => {
    const user = makeUser(`u_${randomUUID().slice(0, 8)}`);
    const res = await app.request('/v1/media/perturb', {
        method: 'POST',
        headers: { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ mimetype: 'image/gif', image: tinyPngBase64 }),
    });
    assert.equal(res.status, 400);
});
