import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

const KEY_V1 = randomBytes(32).toString('base64');

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1}`;

/**
 * Regression: the streaming hub's "Bridges & Webhooks" view mounts five
 * panels (Twitch/YouTube/Kick chat bridges, discord-compat webhooks, outbound
 * event webhooks) that each fire a list fetch on mount. Those routes used to
 * sit on the tight fail-closed `auth` bucket (10/min/IP, shared with
 * login/refresh), so a single page view exhausted the budget and the last
 * panels to mount rendered "Could not load … (429)". They now use the
 * per-user `integrations` bucket; the `auth` bucket must stay untouched.
 */

/** Counts hits per key so tests can assert which bucket a request landed in. */
class RecordingStore {
    readonly hitsByKey = new Map<string, number[]>();

    async hit(key: string, windowMs: number): Promise<number> {
        const now = Date.now();
        const history = (this.hitsByKey.get(key) ?? []).filter((ts) => now - ts < windowMs);
        history.push(now);
        this.hitsByKey.set(key, history);
        return history.length;
    }

    keys(): string[] {
        return [...this.hitsByKey.keys()];
    }
}

// One store for the whole file: each rate-limit middleware caches the store it
// resolves on its first request, so swapping stores between tests would not
// take effect. Installed before the app ever serves a request.
const store = new RecordingStore();
const { setDefaultRateLimitStore } = await import('../src/middleware/rate-limit');
setDefaultRateLimitStore(store);

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const auth = await import('../src/services/auth');

const PAGE_PATHS = [
    '/v1/integrations/twitch/chat-bridges',
    '/v1/integrations/youtube/chat-bridges',
    '/v1/integrations/kick/chat-bridges',
    '/v1/integrations/discord-compat/webhooks',
    '/v1/integrations/outbound-webhooks',
] as const;

const seedUser = () => {
    const id = randomUUID();
    const username = `rl-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: auth.hashPassword('Original-Pass-1234!'),
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return { id, token: auth.signJwt(id, username) };
};

const getAs = (path: string, token: string, ip: string) =>
    app.request(path, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': ip },
    });

/** Fire the same burst the Bridges & Webhooks view fires on mount. */
const fetchPage = async (token: string, ip: string): Promise<number[]> => {
    const statuses: number[] = [];
    for (const path of PAGE_PATHS) {
        statuses.push((await getAs(path, token, ip)).status);
    }
    return statuses;
};

test('bridges & webhooks mount burst never 429s and never touches the auth bucket', async () => {
    const alice = seedUser();

    // Three back-to-back page views (15 requests inside one window) — a user
    // flipping between hub views. Under the old shared `auth` bucket the 11th
    // request would already have been rejected.
    for (let view = 0; view < 3; view += 1) {
        const statuses = await fetchPage(alice.token, '203.0.113.9');
        assert.deepEqual(
            statuses,
            [200, 200, 200, 200, 200],
            `page view ${view + 1} should load every panel, got ${statuses.join(',')}`
        );
    }

    const keys = store.keys();
    assert.ok(
        keys.includes(`integrations:${alice.id}`),
        `expected a per-user integrations bucket key, saw: ${keys.join(', ')}`
    );
    assert.ok(
        !keys.some((k) => k.startsWith('auth:')),
        `settings reads must not consume the login/brute-force budget, saw: ${keys.join(', ')}`
    );
});

test('integrations bucket still enforces a ceiling, keyed per user not per IP', async () => {
    const alice = seedUser();
    const bob = seedUser();
    const sharedIp = '198.51.100.77';

    // Drive Alice into her limit (bounded loop; default budget is 60/min and the
    // global per-IP bucket sits at 120/min, so the loop stays below the latter).
    let aliceLimited = false;
    for (let i = 0; i < 100 && !aliceLimited; i += 1) {
        const res = await getAs(PAGE_PATHS[2], alice.token, sharedIp);
        if (res.status === 429) aliceLimited = true;
        else assert.equal(res.status, 200);
    }
    assert.ok(aliceLimited, 'the integrations bucket must still enforce a per-user ceiling');

    // Bob shares the NAT/IP but has his own budget, so the page still loads.
    const bobStatuses = await fetchPage(bob.token, sharedIp);
    assert.deepEqual(
        bobStatuses,
        [200, 200, 200, 200, 200],
        'a second user behind the same IP must not inherit an exhausted budget'
    );
});
