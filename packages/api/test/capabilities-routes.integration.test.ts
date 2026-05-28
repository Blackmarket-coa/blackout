import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt, deriveUserCapabilities } = await import('../src/services/auth');

function authHeaders(userId: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(userId, userId.replace(/[^a-z0-9]/gi, '') || 'user', 600)}`,
    };
}

type CapabilitiesResponse = { subject: string; capabilities: string[] };

test('GET /v1/capabilities requires a signed-in user', async () => {
    const response = await app.request('/v1/capabilities');
    assert.equal(response.status, 401);
});

test('GET /v1/capabilities returns the JWT-embedded capability set', async () => {
    const userId = '@caps-user:server';
    const response = await app.request('/v1/capabilities', { headers: authHeaders(userId) });
    assert.equal(response.status, 200);
    const body = (await response.json()) as CapabilitiesResponse;
    assert.equal(body.subject, userId);
    // Sanity: the canonical set always grants `profile.read` (the capability
    // that gates the client `/profile/me` route).
    assert.ok(body.capabilities.includes('profile.read'));
    assert.deepEqual([...body.capabilities].sort(), [...deriveUserCapabilities()].sort());
});
