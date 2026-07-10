import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.CLICKHOUSE_URL = 'http://clickhouse.test:8123';
process.env.CLICKHOUSE_PASSWORD = 'test-ch-password';

interface FetchCall {
    url: string;
    init: RequestInit | undefined;
}

const fetchCalls: FetchCall[] = [];
type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchHandler: FetchHandler = () => new Response(JSON.stringify({ data: [] }), { status: 200 });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ url, init });
    return await fetchHandler(url, init);
}) as typeof fetch;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { clearClickhouseConfigCache } = await import('../src/config/clickhouse');

const USER_ID = '@creator:blackout.test';

function authHeaders(): Record<string, string> {
    return { authorization: `Bearer ${signJwt(USER_ID, 'creator', 600)}` };
}

function resetAll(): void {
    fetchCalls.length = 0;
    fetchHandler = () => new Response(JSON.stringify({ data: [] }), { status: 200 });
    process.env.CLICKHOUSE_URL = 'http://clickhouse.test:8123';
    clearClickhouseConfigCache();
}

const summaryRow = {
    stream_views: 12,
    unique_viewers: 5,
    watch_seconds: 1800,
    clip_plays: 9,
    peak_concurrent: 21,
};

void test('GET /v1/telemetry/creator/summary requires auth', async () => {
    resetAll();
    const response = await app.request('/v1/telemetry/creator/summary');
    assert.equal(response.status, 401);
    assert.equal(fetchCalls.length, 0);
});

void test('summary aggregates land with the caller as creator param', async () => {
    resetAll();
    fetchHandler = (url) => {
        // searchParams encode spaces as '+'; normalize before matching the SQL.
        const decoded = decodeURIComponent(url.replace(/\+/g, ' '));
        if (decoded.includes('LIMIT 1')) {
            return new Response(JSON.stringify({ data: [{ online: 1, viewer_count: 17 }] }), {
                status: 200,
            });
        }
        return new Response(JSON.stringify({ data: [summaryRow] }), { status: 200 });
    };

    const response = await app.request('/v1/telemetry/creator/summary?days=28', {
        headers: authHeaders(),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        available: true,
        summary: {
            days: 28,
            streamViews: 12,
            uniqueViewers: 5,
            watchSeconds: 1800,
            clipPlays: 9,
            peakConcurrentViewers: 21,
            liveViewersNow: 17,
        },
    });

    const aggregateCall = fetchCalls[0]!;
    const url = new URL(aggregateCall.url);
    assert.equal(url.searchParams.get('param_creator'), USER_ID);
    assert.equal(url.searchParams.get('param_days'), '28');
    assert.equal(url.searchParams.get('database'), 'analytics_raw');
    const auth = `Basic ${Buffer.from('default:test-ch-password').toString('base64')}`;
    assert.equal((aggregateCall.init?.headers as Record<string, string>).authorization, auth);
});

void test('no fresh snapshot yields liveViewersNow: null', async () => {
    resetAll();
    fetchHandler = (url) => {
        const decoded = decodeURIComponent(url.replace(/\+/g, ' '));
        if (decoded.includes('LIMIT 1')) {
            return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [summaryRow] }), { status: 200 });
    };
    const response = await app.request('/v1/telemetry/creator/summary', {
        headers: authHeaders(),
    });
    const body = (await response.json()) as {
        summary: { liveViewersNow: number | null; days: number };
    };
    assert.equal(body.summary.liveViewersNow, null);
    assert.equal(body.summary.days, 7);
});

void test('out-of-range days is rejected', async () => {
    resetAll();
    const response = await app.request('/v1/telemetry/creator/summary?days=365', {
        headers: authHeaders(),
    });
    assert.equal(response.status, 400);
    assert.equal(fetchCalls.length, 0);
});

void test('unconfigured warehouse reports available: false', async () => {
    resetAll();
    delete process.env.CLICKHOUSE_URL;
    clearClickhouseConfigCache();
    const response = await app.request('/v1/telemetry/creator/summary', {
        headers: authHeaders(),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { available: false });
    assert.equal(fetchCalls.length, 0);
});
