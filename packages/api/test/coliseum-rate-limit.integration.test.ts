import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_API_SKIP_LISTEN = process.env.BLACKOUT_API_SKIP_LISTEN ?? '1';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
// Low vote ceiling so the limit is reachable in a handful of requests.
process.env.COLISEUM_VOTE_RATE_LIMIT_MAX = '3';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');

function authHeader(userId: string): Record<string, string> {
    return { authorization: `Bearer ${signJwt(userId, userId, 600)}`, 'content-type': 'application/json' };
}

function vote(userId: string) {
    return app.request('/v1/coliseum/arguments/arg-grid-1/vote', {
        method: 'POST',
        headers: authHeader(userId),
        body: JSON.stringify({ direction: 'up' }),
    });
}

test('coliseum vote writes are rate limited per user with a 429 + Retry-After', async () => {
    // First three are allowed (limit = 3), the fourth trips the limit.
    for (let i = 0; i < 3; i += 1) {
        const ok = await vote('@spammer:server');
        assert.equal(ok.status, 201);
    }
    const limited = await vote('@spammer:server');
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as { code: string }).code, 'rate_limited');
    assert.ok(limited.headers.get('Retry-After'));
});

test('the limit is keyed per user, so a different account is unaffected', async () => {
    const other = await vote('@calm-voter:server');
    assert.equal(other.status, 201);
});
