import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.OWNCAST_BASE_URL = 'http://owncast.test:8080';
process.env.CLICKHOUSE_URL = 'http://clickhouse.test:8123';
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

const { runOwncastMetricsPoll, OWNCAST_SNAPSHOT_ACTOR, OWNCAST_SNAPSHOT_EVENT_TYPE } = await import(
    '../src/services/owncastMetricsScheduler'
);
const { clearClickhouseConfigCache } = await import('../src/config/clickhouse');

function resetAll(): void {
    fetchCalls.length = 0;
    process.env.CLICKHOUSE_URL = 'http://clickhouse.test:8123';
    clearClickhouseConfigCache();
}

const statusResponse = (online: boolean, viewerCount: number) =>
    new Response(JSON.stringify({ online, viewerCount }), {
        headers: { 'content-type': 'application/json' },
    });

void test('a live status snapshot lands in the warehouse', async () => {
    resetAll();
    fetchHandler = (url) => {
        if (url.includes('owncast.test')) return statusResponse(true, 42);
        return new Response('', { status: 200 });
    };

    const outcome = await runOwncastMetricsPoll();
    assert.deepEqual(outcome, { kind: 'recorded', online: true, viewerCount: 42 });

    const statusCall = fetchCalls.find((call) => call.url.includes('owncast.test'));
    assert.equal(statusCall?.url, 'http://owncast.test:8080/api/status');

    const insertCall = fetchCalls.find((call) => call.url.includes('clickhouse.test'));
    assert.ok(insertCall, 'expected a ClickHouse insert');
    const row = JSON.parse(String(insertCall!.init?.body));
    assert.equal(row.event_type, OWNCAST_SNAPSHOT_EVENT_TYPE);
    assert.equal(row.actor_mxid, OWNCAST_SNAPSHOT_ACTOR);
    assert.deepEqual(JSON.parse(row.payload), { online: true, viewerCount: 42 });
});

void test('an unreachable origin skips the warehouse write', async () => {
    resetAll();
    fetchHandler = () => new Response('', { status: 503 });

    const outcome = await runOwncastMetricsPoll();
    assert.deepEqual(outcome, { kind: 'unreachable' });
    assert.equal(fetchCalls.filter((call) => call.url.includes('clickhouse.test')).length, 0);
});

void test('a disabled warehouse still polls but reports skipped', async () => {
    resetAll();
    delete process.env.CLICKHOUSE_URL;
    clearClickhouseConfigCache();
    fetchHandler = () => statusResponse(true, 7);

    const outcome = await runOwncastMetricsPoll();
    assert.deepEqual(outcome, { kind: 'skipped', reason: 'warehouse_disabled' });
    assert.equal(fetchCalls.length, 1);
});
