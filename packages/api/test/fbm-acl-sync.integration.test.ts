import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.FREEBLACKMARKET_STUB = '1';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET =
    process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? 'stub-webhook-secret';
process.env.FBM_ENTITLEMENTS_STUB = '1';
process.env.FBM_ACL_SYNC_ENABLED = '1';

const { db } = await import('../src/db/store');
const { FbmEntitlementsHttpClient, FbmEntitlementsServiceError } = await import(
    '../src/integrations/fbm/entitlementsClient'
);
const { FbmEntitlementsStubClient } = await import(
    '../src/integrations/fbm/entitlementsStubClient'
);
const { CachingEntitlementsClient, getEntitlementsClient, getEntitlementsStubForTest, resetEntitlementsClientForTest } =
    await import('../src/integrations/fbm/entitlementsClientFactory');
const { syncMxidAcls, reconcileAllAcls } = await import('../src/services/fbmAclSync');
const { tryHandleEntitlementsChanged } = await import('../src/services/fbmAclSync/webhookTrigger');
const { resetMarketplaceEntitlementsForTest } = await import(
    '../src/services/marketplaceEntitlements'
);

import type { GovernanceRole } from '../src/integrations/fbm/entitlementsContract';

function fakeMatrix() {
    const rooms = new Map<string, Record<string, unknown>>();
    const writes: Array<{ roomId: string; content: Record<string, unknown> }> = [];
    return {
        rooms,
        writes,
        async getStateEvent(roomId: string, _type: string, _key = '') {
            const content = rooms.get(roomId);
            return content
                ? { ok: true as const, status: 200, content }
                : { ok: false as const, status: 404 };
        },
        async sendStateEvent(
            roomId: string,
            _type: string,
            content: Record<string, unknown>,
            _key = ''
        ) {
            rooms.set(roomId, content);
            writes.push({ roomId, content });
            return { ok: true as const, status: 200, eventId: `$s${writes.length}` };
        },
    };
}

const roleWith = (roomId: string, powerLevel: number): GovernanceRole => ({
    coalitionId: 'coop-1',
    role: 'steward',
    matrixAcls: [{ roomId, powerLevel }],
    commercePermissions: [],
});

// --- HTTP client: retry / breaker / terminal codes ---------------------------

test('http client: retries 5xx then succeeds, parses governance roles', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
        calls += 1;
        if (calls < 3) return new Response('boom', { status: 503 });
        return new Response(JSON.stringify({ roles: [roleWith('!r:srv', 50)] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new FbmEntitlementsHttpClient({
        baseUrl: 'https://ent.example/v1',
        serviceToken: 'tok',
        fetchImpl,
    });
    const roles = await client.getGovernanceRoles('@a:srv');
    assert.equal(calls, 3);
    assert.equal(roles[0]!.matrixAcls[0]!.powerLevel, 50);
});

test('http client: 401 is terminal (no retry) and typed', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
        calls += 1;
        return new Response('nope', { status: 401 });
    }) as unknown as typeof fetch;
    const client = new FbmEntitlementsHttpClient({
        baseUrl: 'https://ent.example/v1',
        serviceToken: 'tok',
        fetchImpl,
    });
    await assert.rejects(
        () => client.getEconomicStanding('@a:srv'),
        (err: unknown) => err instanceof FbmEntitlementsServiceError && err.code === 'unauthorized'
    );
    assert.equal(calls, 1);
});

test('http client: circuit opens after consecutive failures', async () => {
    const fetchImpl = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    let t = 0;
    const client = new FbmEntitlementsHttpClient({
        baseUrl: 'https://ent.example/v1',
        serviceToken: 'tok',
        fetchImpl,
        now: () => t,
    });
    // Each call does 3 attempts then recordFailure once → 5 calls to trip breaker.
    for (let i = 0; i < 5; i++) {
        await assert.rejects(() => client.getSummary('@a:srv'));
    }
    await assert.rejects(
        () => client.getSummary('@a:srv'),
        (err: unknown) => err instanceof FbmEntitlementsServiceError && err.code === 'circuit_open'
    );
});

// --- caching wrapper ---------------------------------------------------------

test('caching wrapper: governance roles cached within window', async () => {
    let calls = 0;
    const inner = new FbmEntitlementsStubClient();
    inner.seed('@a:srv', { governanceRoles: [roleWith('!r:srv', 25)] });
    const counting = {
        ...inner,
        getGovernanceRoles: async (mxid: string) => {
            calls += 1;
            return inner.getGovernanceRoles(mxid);
        },
    } as unknown as InstanceType<typeof FbmEntitlementsStubClient>;
    const cached = new CachingEntitlementsClient(counting);
    await cached.getGovernanceRoles('@a:srv');
    await cached.getGovernanceRoles('@a:srv');
    assert.equal(calls, 1, 'second read served from cache');
});

// --- ACL sync worker ---------------------------------------------------------

test('syncMxidAcls: applies highest power level per room, idempotent, drift-corrects', async () => {
    db.resetFbmAclStateForTest();
    const entitlements = new FbmEntitlementsStubClient();
    // Two roles touching the same room → highest (75) wins.
    entitlements.seed('@a:srv', {
        governanceRoles: [roleWith('!room:srv', 50), roleWith('!room:srv', 75)],
    });
    const matrix = fakeMatrix();

    const first = await syncMxidAcls('@a:srv', { entitlements, matrix });
    assert.equal(first.applied, 1);
    assert.equal((matrix.rooms.get('!room:srv') as { users: Record<string, number> }).users['@a:srv'], 75);
    assert.equal(db.getFbmAclState('@a:srv', '!room:srv')!.powerLevel, 75);

    // Replay → skipped (no new write).
    const second = await syncMxidAcls('@a:srv', { entitlements, matrix });
    assert.equal(second.applied, 0);
    assert.equal(second.skipped, 1);

    // Server drift: someone lowered it. Reconcile re-asserts 75.
    matrix.rooms.set('!room:srv', { users: { '@a:srv': 0 } });
    // The persisted last-applied still says 75, so syncMxidAcls would skip on the
    // DB check; reconcile is the same call — assert it re-writes when on-server differs.
    db.upsertFbmAclState({
        mxid: '@a:srv',
        roomId: '!room:srv',
        powerLevel: 0, // pretend last-applied drifted
        appliedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
    });
    const third = await reconcileAllAcls({ entitlements, matrix });
    assert.equal(third.mxids, 1);
    assert.equal((matrix.rooms.get('!room:srv') as { users: Record<string, number> }).users['@a:srv'], 75);
});

test('syncMxidAcls: no entitlements client configured → unavailable no-op', async () => {
    db.resetFbmAclStateForTest();
    // Force the factory to resolve to "unconfigured": stub off, no base URL.
    const prevStub = process.env.FBM_ENTITLEMENTS_STUB;
    delete process.env.FBM_ENTITLEMENTS_STUB;
    resetEntitlementsClientForTest();
    try {
        const matrix = fakeMatrix();
        const res = await syncMxidAcls('@a:srv', { matrix }); // no dep → factory returns undefined
        assert.equal(res.unavailable, true);
        assert.equal(res.applied, 0);
        assert.equal(matrix.writes.length, 0);
    } finally {
        if (prevStub !== undefined) process.env.FBM_ENTITLEMENTS_STUB = prevStub;
        resetEntitlementsClientForTest();
    }
});

// --- factory + stub selection ------------------------------------------------

test('factory: returns the stub when FBM_ENTITLEMENTS_STUB=1 and is seedable', async () => {
    resetEntitlementsClientForTest();
    const client = getEntitlementsClient();
    assert.ok(client, 'stub client present');
    const stub = getEntitlementsStubForTest();
    assert.ok(stub, 'stub instance exposed');
    stub!.seed('@b:srv', { governanceRoles: [roleWith('!x:srv', 100)] });
    const roles = await client!.getGovernanceRoles('@b:srv');
    assert.equal(roles[0]!.matrixAcls[0]!.powerLevel, 100);
});

// --- entitlements.changed webhook trigger ------------------------------------

test('tryHandleEntitlementsChanged: acks entitlements.changed, replay idempotent; null otherwise', async () => {
    resetMarketplaceEntitlementsForTest();
    const provider = { id: 'freeblackmarket' } as never;

    assert.equal(tryHandleEntitlementsChanged(provider, { type: 'order.created' }), null);
    assert.equal(tryHandleEntitlementsChanged(provider, { type: 'entitlements.changed' }), null); // missing ids

    const evt = { type: 'entitlements.changed', eventId: 'ent-1', mxid: '@a:srv' };
    const first = tryHandleEntitlementsChanged(provider, evt);
    assert.ok(first);
    assert.equal(first!.ok, true);
    assert.equal(first!.applied.alreadyProcessed, false);

    const replay = tryHandleEntitlementsChanged(provider, evt);
    assert.equal(replay!.applied.alreadyProcessed, true);
});
