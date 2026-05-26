import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.BLACKOUT_PLUGIN_INSTALL_SCOPES = 'true';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { provisionPluginDens, listPluginDensForInstallation } = await import(
    '../src/services/pluginDens'
);

const USER_ID = 'pd-user';

function headers(userId: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(userId, userId, 600)}`,
        'content-type': 'application/json',
    };
}

function seedInstallation(id: string) {
    return db.createPluginInstallation({
        id,
        pluginId: 'fancy-stickers',
        entitlementId: null,
        scopeType: 'user',
        scopeId: USER_ID,
        installedByUserId: USER_ID,
        status: 'enabled',
        artifactKind: 'manifest_plugin',
        domain: null,
        grantedCapabilities: [],
        config: {},
        manifest: { name: 'Fancy Stickers', pluginDens: [{ purpose: 'support' }] },
    });
}

test('provisionPluginDens records linkage via an injected provisioner and is idempotent', async () => {
    seedInstallation('pd-inst-1');
    const calls: string[] = [];
    const fakeProvisioner = async (plan: { purpose: string }) => {
        calls.push(plan.purpose);
        return { ok: true as const, denId: `!room-${plan.purpose}:test` };
    };

    const first = await provisionPluginDens(
        {
            installationId: 'pd-inst-1',
            pluginId: 'fancy-stickers',
            pluginName: 'Fancy Stickers',
            specs: [{ purpose: 'support' }, { purpose: 'tutorial', denType: 'private' }],
        },
        fakeProvisioner,
    );
    assert.equal(first.provisioned.length, 2);
    assert.equal(first.failures.length, 0);
    assert.equal(calls.length, 2);
    assert.equal(listPluginDensForInstallation('pd-inst-1').length, 2);

    // Re-provisioning does not create duplicates or call the provisioner again.
    const second = await provisionPluginDens(
        {
            installationId: 'pd-inst-1',
            pluginId: 'fancy-stickers',
            pluginName: 'Fancy Stickers',
            specs: [{ purpose: 'support' }, { purpose: 'tutorial', denType: 'private' }],
        },
        fakeProvisioner,
    );
    assert.equal(second.provisioned.length, 2);
    assert.equal(calls.length, 2, 'provisioner not called again for existing dens');
    assert.equal(listPluginDensForInstallation('pd-inst-1').length, 2);
});

test('provisionPluginDens records failures when the provisioner cannot create a room', async () => {
    seedInstallation('pd-inst-2');
    const failing = async () => ({ ok: false as const, reason: 'matrix_not_configured' });
    const result = await provisionPluginDens(
        {
            installationId: 'pd-inst-2',
            pluginId: 'fancy-stickers',
            pluginName: 'Fancy Stickers',
            specs: [{ purpose: 'support' }],
        },
        failing,
    );
    assert.equal(result.provisioned.length, 0);
    assert.deepEqual(result.failures, [{ purpose: 'support', reason: 'matrix_not_configured' }]);
    assert.equal(listPluginDensForInstallation('pd-inst-2').length, 0);
});

test('den endpoints 404 when the plugin-dens flag is off', async () => {
    seedInstallation('pd-inst-3');
    const res = await app.request('/v1/plugin-installations/pd-inst-3/dens', {
        headers: headers(USER_ID),
    });
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as { code: string }).code, 'feature_disabled');
});

test('GET dens lists provisioned linkage when the flag is on', async () => {
    seedInstallation('pd-inst-4');
    await provisionPluginDens(
        {
            installationId: 'pd-inst-4',
            pluginId: 'fancy-stickers',
            pluginName: 'Fancy Stickers',
            specs: [{ purpose: 'support' }],
        },
        async (plan) => ({ ok: true as const, denId: `!r-${plan.purpose}:test` }),
    );
    process.env.BLACKOUT_PLUGIN_DENS = 'true';
    try {
        const res = await app.request('/v1/plugin-installations/pd-inst-4/dens', {
            headers: headers(USER_ID),
        });
        assert.equal(res.status, 200);
        const json = (await res.json()) as { dens: Array<{ purpose: string; denId: string }> };
        assert.equal(json.dens.length, 1);
        assert.equal(json.dens[0].purpose, 'support');
    } finally {
        process.env.BLACKOUT_PLUGIN_DENS = '';
    }
});
