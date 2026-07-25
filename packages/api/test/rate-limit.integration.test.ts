import test from 'node:test';
import assert from 'node:assert/strict';
import type { RateLimitStore } from '../src/middleware/rate-limit';
import { createRateLimit, setDefaultRateLimitStore } from '../src/middleware/rate-limit';

class FakeRedisStore implements RateLimitStore {
    // Maps key → array of timestamps. Shared between "replicas" by reference.
    constructor(private readonly state: Map<string, number[]>) {}

    async hit(key: string, windowMs: number): Promise<number> {
        const now = Date.now();
        const history = (this.state.get(key) ?? []).filter((ts) => now - ts < windowMs);
        history.push(now);
        this.state.set(key, history);
        return history.length;
    }
}

class ExplodingStore implements RateLimitStore {
    async hit(): Promise<number> {
        throw new Error('redis unavailable');
    }
}

const buildContext = (forwardedFor: string | null) => {
    const headers = new Map<string, string>();
    if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);
    let bodyJson: unknown = null;
    let status = 200;
    return {
        req: {
            header: (name: string) => headers.get(name.toLowerCase()),
        },
        header: () => undefined,
        json: (body: unknown, code?: number) => {
            bodyJson = body;
            if (code) status = code;
            return { body, status };
        },
        get _result() {
            return { body: bodyJson, status };
        },
    } as unknown as Parameters<ReturnType<typeof createRateLimit>>[0] & {
        _result: { body: unknown; status: number };
    };
};

test('shared store enforces a global limit across simulated replicas', async () => {
    const shared = new Map<string, number[]>();
    const replicaA = createRateLimit({
        bucket: 'global-test',
        windowMs: 60_000,
        maxRequests: 3,
        store: new FakeRedisStore(shared),
    });
    const replicaB = createRateLimit({
        bucket: 'global-test',
        windowMs: 60_000,
        maxRequests: 3,
        store: new FakeRedisStore(shared),
    });

    const next = async () => undefined;
    // 2 hits on replica A
    for (let i = 0; i < 2; i += 1) {
        const ctx = buildContext('203.0.113.7');
        await replicaA(ctx as never, next as never);
        assert.equal((ctx as { _result: { status: number } })._result.status, 200);
    }
    // 1 hit on replica B — total 3, within limit
    {
        const ctx = buildContext('203.0.113.7');
        await replicaB(ctx as never, next as never);
        assert.equal((ctx as { _result: { status: number } })._result.status, 200);
    }
    // 4th hit on replica B — total 4, should be blocked
    {
        const ctx = buildContext('203.0.113.7');
        await replicaB(ctx as never, next as never);
        assert.equal((ctx as { _result: { status: number } })._result.status, 429);
    }
});

test('keys on the trusted proxy hop (rightmost X-Forwarded-For), not the client-spoofable prefix', async () => {
    // With TRUSTED_PROXY_HOPS=1 (default), the limiter keys on the address our
    // own reverse proxy appended — the RIGHTMOST entry — never the leftmost value
    // the client can forge. This prevents rate-limit evasion by header rotation.
    const shared = new Map<string, number[]>();
    const mw = createRateLimit({
        bucket: 'fwd-test',
        windowMs: 60_000,
        maxRequests: 1,
        store: new FakeRedisStore(shared),
    });
    const next = async () => undefined;

    // First request arrives via trusted proxy hop 10.0.0.1 — allowed.
    const ctx1 = buildContext('198.51.100.5, 10.0.0.1');
    await mw(ctx1 as never, next as never);
    assert.equal((ctx1 as { _result: { status: number } })._result.status, 200);

    // Attacker rotates the spoofable leftmost value but arrives via the SAME
    // trusted proxy hop — must share the bucket and be blocked.
    const ctx2 = buildContext('203.0.113.250, 10.0.0.1');
    await mw(ctx2 as never, next as never);
    assert.equal(
        (ctx2 as { _result: { status: number } })._result.status,
        429,
        'rotating the client-controlled X-Forwarded-For prefix must not evade the limit'
    );

    // A genuinely different trusted upstream hop gets its own bucket.
    const ctx3 = buildContext('198.51.100.5, 10.0.0.2');
    await mw(ctx3 as never, next as never);
    assert.equal(
        (ctx3 as { _result: { status: number } })._result.status,
        200,
        'a different trusted proxy hop has its own bucket'
    );
});

test('fails open with a warning when the store throws', async () => {
    const mw = createRateLimit({
        bucket: 'err-test',
        windowMs: 60_000,
        maxRequests: 1,
        store: new ExplodingStore(),
    });
    let nextCalled = false;
    const next = async () => {
        nextCalled = true;
    };
    const ctx = buildContext('203.0.113.10');
    await mw(ctx as never, next as never);
    assert.equal(nextCalled, true);
});

test('fails closed (429) when a failClosed bucket store throws', async () => {
    const mw = createRateLimit({
        bucket: 'auth-test',
        windowMs: 60_000,
        maxRequests: 1,
        store: new ExplodingStore(),
        failClosed: true,
    });
    let nextCalled = false;
    const next = async () => {
        nextCalled = true;
    };
    const ctx = buildContext('203.0.113.11');
    await mw(ctx as never, next as never);
    assert.equal(nextCalled, false, 'request must not proceed when protection is unavailable');
    assert.equal((ctx as { _result: { status: number } })._result.status, 429);
});

test('setDefaultRateLimitStore replaces the lazily-resolved default', async () => {
    const shared = new Map<string, number[]>();
    setDefaultRateLimitStore(new FakeRedisStore(shared));
    const mw = createRateLimit({ bucket: 'default-test', windowMs: 60_000, maxRequests: 1 });
    const next = async () => undefined;

    const ctx1 = buildContext('203.0.113.20');
    await mw(ctx1 as never, next as never);
    assert.equal((ctx1 as { _result: { status: number } })._result.status, 200);

    const ctx2 = buildContext('203.0.113.20');
    await mw(ctx2 as never, next as never);
    assert.equal((ctx2 as { _result: { status: number } })._result.status, 429);

    setDefaultRateLimitStore(null);
});
