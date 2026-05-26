import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
// Phase 1 flag must be on for the routes to be reachable.
process.env.BLACKOUT_PLUGIN_INSTALL_SCOPES = 'true';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const MEMBER_ID = 'pi-member';
const COORDINATOR_ID = 'pi-coordinator';

db.createUser({
    id: COORDINATOR_ID,
    username: 'pi-coordinator',
    email: 'coordinator@plugin-installs.test',
    passwordHash: 'x',
    reputationScore: 600,
    reputationTier: 'coordinator',
    pubkeyEd25519: 'pk-coordinator',
});

function headers(userId: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(userId, userId, 600)}`,
        'content-type': 'application/json',
    };
}

function userScope(id: string) {
    return { type: 'user', id };
}

test('routes 404 when the install-scopes flag is disabled', async () => {
    process.env.BLACKOUT_PLUGIN_INSTALL_SCOPES = '';
    try {
        const res = await app.request('/v1/plugin-installations?scopeType=user&scopeId=x', {
            headers: headers(MEMBER_ID),
        });
        assert.equal(res.status, 404);
        const json = (await res.json()) as { code: string };
        assert.equal(json.code, 'feature_disabled');
    } finally {
        process.env.BLACKOUT_PLUGIN_INSTALL_SCOPES = 'true';
    }
});

test('install a free plugin at the caller own user scope', async () => {
    const res = await app.request('/v1/plugin-installations', {
        method: 'POST',
        headers: headers(MEMBER_ID),
        body: JSON.stringify({
            pluginId: 'debate-timer',
            scope: userScope(MEMBER_ID),
            artifactKind: 'manifest_plugin',
            domain: 'coliseum',
        }),
    });
    assert.equal(res.status, 201);
    const json = (await res.json()) as { installation: { status: string; scope: { type: string } } };
    assert.equal(json.installation.status, 'enabled');
    assert.equal(json.installation.scope.type, 'user');

    const active = await app.request(
        `/v1/plugin-installations/active?pluginId=debate-timer&scopeType=user&scopeId=${MEMBER_ID}`,
        { headers: headers(MEMBER_ID) },
    );
    assert.deepEqual(await active.json(), { active: true });
});

test('cannot install on another user scope', async () => {
    const res = await app.request('/v1/plugin-installations', {
        method: 'POST',
        headers: headers(MEMBER_ID),
        body: JSON.stringify({
            pluginId: 'debate-timer',
            scope: userScope('someone-else'),
            artifactKind: 'manifest_plugin',
        }),
    });
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { code: string }).code, 'scope_forbidden');
});

test('den install requires elevated reputation (member denied, coordinator allowed)', async () => {
    const denied = await app.request('/v1/plugin-installations', {
        method: 'POST',
        headers: headers(MEMBER_ID),
        body: JSON.stringify({
            pluginId: 'mod-tools',
            scope: { type: 'den', id: 'den-1' },
            artifactKind: 'manifest_plugin',
        }),
    });
    assert.equal(denied.status, 403);

    const allowed = await app.request('/v1/plugin-installations', {
        method: 'POST',
        headers: headers(COORDINATOR_ID),
        body: JSON.stringify({
            pluginId: 'mod-tools',
            scope: { type: 'den', id: 'den-1' },
            artifactKind: 'manifest_plugin',
        }),
    });
    assert.equal(allowed.status, 201);
    assert.equal(((await allowed.json()) as { installation: { status: string } }).installation.status, 'enabled');
});

test('coalition install is per-den opt-in: available at coalition, not active in dens until enabled', async () => {
    // Coalition makes the plugin available — it must NOT auto-activate any den.
    const coalition = await app.request('/v1/plugin-installations', {
        method: 'POST',
        headers: headers(COORDINATOR_ID),
        body: JSON.stringify({
            pluginId: 'aid-board',
            scope: { type: 'coalition', id: 'coa-1' },
            artifactKind: 'manifest_plugin',
        }),
    });
    assert.equal(coalition.status, 201);
    assert.equal(
        ((await coalition.json()) as { installation: { status: string } }).installation.status,
        'available',
    );

    // A den in the coalition has not opted in yet → not active.
    const before = await app.request(
        '/v1/plugin-installations/active?pluginId=aid-board&scopeType=den&scopeId=coa-den-A',
        { headers: headers(COORDINATOR_ID) },
    );
    assert.deepEqual(await before.json(), { active: false });

    // Den admin opts in by creating a den-scope enabled install.
    await app.request('/v1/plugin-installations', {
        method: 'POST',
        headers: headers(COORDINATOR_ID),
        body: JSON.stringify({
            pluginId: 'aid-board',
            scope: { type: 'den', id: 'coa-den-A' },
            artifactKind: 'manifest_plugin',
        }),
    });
    const after = await app.request(
        '/v1/plugin-installations/active?pluginId=aid-board&scopeType=den&scopeId=coa-den-A',
        { headers: headers(COORDINATOR_ID) },
    );
    assert.deepEqual(await after.json(), { active: true });

    // The coalition's available list surfaces the offered plugin.
    const available = await app.request('/v1/plugin-installations/coalition/coa-1/available', {
        headers: headers(COORDINATOR_ID),
    });
    const list = (await available.json()) as { installations: Array<{ pluginId: string }> };
    assert.ok(list.installations.some((i) => i.pluginId === 'aid-board'));
});

test('paid plugin: blocked without entitlement, allowed with an owned active one', async () => {
    const blocked = await app.request('/v1/plugin-installations', {
        method: 'POST',
        headers: headers(MEMBER_ID),
        body: JSON.stringify({
            pluginId: 'pro-overlay',
            scope: userScope(MEMBER_ID),
            artifactKind: 'manifest_plugin',
            requiresEntitlement: true,
        }),
    });
    assert.equal(blocked.status, 402);
    assert.equal(((await blocked.json()) as { code: string }).code, 'entitlement_required');

    const now = new Date().toISOString();
    db.marketplaceEntitlements.set('ent-1', {
        id: 'ent-1',
        userId: MEMBER_ID,
        providerId: 'freeblackmarket',
        providerListingId: 'pro-overlay',
        sku: null,
        kind: 'plugin_flag',
        status: 'granted',
        grantedAt: now,
        expiresAt: null,
        sourceEventId: 'evt-1',
        metadata: {},
        createdAt: now,
        updatedAt: now,
    });

    const ok = await app.request('/v1/plugin-installations', {
        method: 'POST',
        headers: headers(MEMBER_ID),
        body: JSON.stringify({
            pluginId: 'pro-overlay',
            scope: userScope(MEMBER_ID),
            artifactKind: 'manifest_plugin',
            entitlementId: 'ent-1',
            requiresEntitlement: true,
        }),
    });
    assert.equal(ok.status, 201);
});

test('disable then delete an installation', async () => {
    const created = await app.request('/v1/plugin-installations', {
        method: 'POST',
        headers: headers(MEMBER_ID),
        body: JSON.stringify({
            pluginId: 'lifecycle-plugin',
            scope: userScope(MEMBER_ID),
            artifactKind: 'manifest_plugin',
        }),
    });
    const { installation } = (await created.json()) as { installation: { id: string } };

    const disabled = await app.request(`/v1/plugin-installations/${installation.id}`, {
        method: 'PATCH',
        headers: headers(MEMBER_ID),
        body: JSON.stringify({ status: 'disabled' }),
    });
    assert.equal(disabled.status, 200);

    const active = await app.request(
        `/v1/plugin-installations/active?pluginId=lifecycle-plugin&scopeType=user&scopeId=${MEMBER_ID}`,
        { headers: headers(MEMBER_ID) },
    );
    assert.deepEqual(await active.json(), { active: false });

    const removed = await app.request(`/v1/plugin-installations/${installation.id}`, {
        method: 'DELETE',
        headers: headers(MEMBER_ID),
    });
    assert.equal(removed.status, 200);

    const gone = await app.request(`/v1/plugin-installations/${installation.id}`, {
        method: 'DELETE',
        headers: headers(MEMBER_ID),
    });
    assert.equal(gone.status, 404);
});

test('AI gate is a no-op when BLACKOUT_PLUGIN_AI_CAPABILITY is off', async () => {
    // Flag default-off: an ai.inference plugin installs anywhere (back-compat).
    const res = await app.request('/v1/plugin-installations', {
        method: 'POST',
        headers: headers(COORDINATOR_ID),
        body: JSON.stringify({
            pluginId: 'ai-helper',
            scope: userScope(COORDINATOR_ID),
            artifactKind: 'code_plugin',
            grantedCapabilities: ['ai.inference'],
        }),
    });
    assert.equal(res.status, 201);
});

test('with AI flag on, AI plugins are confined to AI dens', async () => {
    process.env.BLACKOUT_PLUGIN_AI_CAPABILITY = 'true';
    try {
        // Non-den scope is rejected.
        const userScoped = await app.request('/v1/plugin-installations', {
            method: 'POST',
            headers: headers(COORDINATOR_ID),
            body: JSON.stringify({
                pluginId: 'ai-helper',
                scope: userScope(COORDINATOR_ID),
                artifactKind: 'code_plugin',
                grantedCapabilities: ['ai.inference'],
            }),
        });
        assert.equal(userScoped.status, 403);
        assert.equal(((await userScoped.json()) as { code: string }).code, 'ai_scope_forbidden');

        // A den asserted as non-AI is rejected.
        const publicDen = await app.request('/v1/plugin-installations', {
            method: 'POST',
            headers: headers(COORDINATOR_ID),
            body: JSON.stringify({
                pluginId: 'ai-helper',
                scope: { type: 'den', id: 'den-public' },
                artifactKind: 'code_plugin',
                grantedCapabilities: ['ai.inference'],
                denType: 'public',
            }),
        });
        assert.equal(publicDen.status, 403);
        assert.equal(((await publicDen.json()) as { code: string }).code, 'ai_scope_forbidden');

        // An AI den is allowed.
        const aiDen = await app.request('/v1/plugin-installations', {
            method: 'POST',
            headers: headers(COORDINATOR_ID),
            body: JSON.stringify({
                pluginId: 'ai-helper',
                scope: { type: 'den', id: 'den-ai' },
                artifactKind: 'code_plugin',
                grantedCapabilities: ['ai.inference'],
                denType: 'ai',
            }),
        });
        assert.equal(aiDen.status, 201);

        // A non-AI plugin is unaffected by the gate.
        const normal = await app.request('/v1/plugin-installations', {
            method: 'POST',
            headers: headers(COORDINATOR_ID),
            body: JSON.stringify({
                pluginId: 'plain-plugin',
                scope: userScope(COORDINATOR_ID),
                artifactKind: 'manifest_plugin',
                grantedCapabilities: ['message.read'],
            }),
        });
        assert.equal(normal.status, 201);
    } finally {
        process.env.BLACKOUT_PLUGIN_AI_CAPABILITY = '';
    }
});
