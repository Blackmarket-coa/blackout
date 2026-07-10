import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.TELEMETRY_RATE_LIMIT_MAX = process.env.TELEMETRY_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.CLICKHOUSE_URL = 'http://clickhouse.test:8123';
process.env.CLICKHOUSE_USER = 'default';
process.env.CLICKHOUSE_PASSWORD = 'test-ch-password';

interface FetchCall {
    url: string;
    init: RequestInit | undefined;
}

const fetchCalls: FetchCall[] = [];
type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchHandler: FetchHandler = () => new Response('', { status: 200 });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ url, init });
    return await fetchHandler(url, init);
}) as typeof fetch;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { clearClickhouseConfigCache } = await import('../src/config/clickhouse');

const USER_ID = '@viewer:blackout.test';
const USERNAME = 'viewer';

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(USER_ID, USERNAME, 600)}`,
        'content-type': 'application/json',
        ...extra,
    };
}

function resetAll(): void {
    fetchCalls.length = 0;
    fetchHandler = () => new Response('', { status: 200 });
    process.env.CLICKHOUSE_URL = 'http://clickhouse.test:8123';
    clearClickhouseConfigCache();
}

const validBatch = () => ({
    events: [
        {
            eventType: 'feed_item_impression',
            occurredAtMs: Date.now() - 1_000,
            payload: { itemId: 'coalition:x', source: 'coalition' },
        },
        {
            eventType: 'stream_view_heartbeat',
            occurredAtMs: Date.now(),
            coalitionId: '!canopy:test',
            payload: { streamId: 'stream-1', seconds: 15 },
        },
    ],
});

void test('POST /v1/telemetry/events requires auth', async () => {
    resetAll();
    const response = await app.request('/v1/telemetry/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBatch()),
    });
    assert.equal(response.status, 401);
    assert.equal(fetchCalls.length, 0);
});

void test('POST /v1/telemetry/events rejects malformed batches', async () => {
    resetAll();
    const cases = [
        {},
        { events: [] },
        { events: [{ eventType: 'Bad-Type!', occurredAtMs: Date.now() }] },
        { events: [{ eventType: 'ok_event' }] }, // missing occurredAtMs
        { events: Array.from({ length: 51 }, () => ({ eventType: 'e', occurredAtMs: 1 })) },
    ];
    for (const body of cases) {
        const response = await app.request('/v1/telemetry/events', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body),
        });
        assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    }
    assert.equal(fetchCalls.length, 0);
});

void test('valid batch is written to ClickHouse as JSONEachRow with basic auth', async () => {
    resetAll();
    const response = await app.request('/v1/telemetry/events', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(validBatch()),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { accepted: 2, persisted: true });

    assert.equal(fetchCalls.length, 1);
    const call = fetchCalls[0]!;
    assert.ok(call.url.startsWith('http://clickhouse.test:8123/?query='));
    const query = decodeURIComponent(call.url.split('?query=')[1]!);
    assert.equal(query, 'INSERT INTO analytics_raw.events FORMAT JSONEachRow');

    const headers = call.init?.headers as Record<string, string>;
    const expectedAuth = `Basic ${Buffer.from('default:test-ch-password').toString('base64')}`;
    assert.equal(headers.authorization, expectedAuth);

    const rows = String(call.init?.body)
        .split('\n')
        .map((line) => JSON.parse(line));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].event_type, 'feed_item_impression');
    assert.equal(rows[0].actor_mxid, USER_ID);
    assert.equal(rows[0].coalition_id, null);
    assert.match(rows[0].occurred_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    assert.deepEqual(JSON.parse(rows[0].payload), { itemId: 'coalition:x', source: 'coalition' });
    assert.equal(rows[1].coalition_id, '!canopy:test');
    assert.ok(rows[0].event_id.length > 0 && rows[0].event_id !== rows[1].event_id);
});

void test('future and stale timestamps are clamped on ingest', async () => {
    resetAll();
    const before = Date.now();
    const response = await app.request('/v1/telemetry/events', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            events: [
                { eventType: 'future_event', occurredAtMs: before + 60 * 60 * 1000 },
                { eventType: 'ancient_event', occurredAtMs: 1 },
            ],
        }),
    });
    assert.equal(response.status, 202);
    const rows = String(fetchCalls[0]!.init?.body)
        .split('\n')
        .map((line) => JSON.parse(line));
    const toMs = (value: string) => Date.parse(`${value.replace(' ', 'T')}Z`);
    const after = Date.now();
    assert.ok(toMs(rows[0].occurred_at) >= before && toMs(rows[0].occurred_at) <= after);
    const dayMs = 24 * 60 * 60 * 1000;
    assert.ok(
        toMs(rows[1].occurred_at) >= before - dayMs &&
            toMs(rows[1].occurred_at) <= after - dayMs + 1000
    );
});

void test('warehouse failure still returns 202 with persisted=false', async () => {
    resetAll();
    fetchHandler = () => new Response('boom', { status: 500 });
    const response = await app.request('/v1/telemetry/events', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(validBatch()),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { accepted: 2, persisted: false });
});

void test('unconfigured ClickHouse is a silent no-op (202, persisted=false, no egress)', async () => {
    resetAll();
    delete process.env.CLICKHOUSE_URL;
    clearClickhouseConfigCache();
    const response = await app.request('/v1/telemetry/events', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(validBatch()),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { accepted: 2, persisted: false });
    assert.equal(fetchCalls.length, 0);
});
