import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoalitionKitManifest } from '@blackout/core';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { applyCoalitionKitManifest, listCoalitionKitManifestApplications } = await import(
    '../src/services/coalitionKitManifests'
);
const { listInstallationsForScope } = await import('../src/services/pluginInstallations');

const COORDINATOR_ID = 'ck-coordinator';
db.createUser({
    id: COORDINATOR_ID,
    username: 'ck-coordinator',
    email: 'ck@kits.test',
    passwordHash: 'x',
    reputationScore: 600,
    reputationTier: 'coordinator',
    pubkeyEd25519: 'pk-ck',
});

function headers(userId: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(userId, userId, 600)}`,
        'content-type': 'application/json',
    };
}

const rawManifest = {
    version: 1,
    kitId: 'organizer-starter',
    name: 'Organizer Starter',
    archetype: 'organizer',
    customization: { activePreset: 'governance', features: { 'features.governance': true }, theme: 'noir' },
    dens: [
        { slug: 'welcome', denType: 'coalition', name: 'Welcome' },
        { slug: 'ops', denType: 'private', name: 'Ops', topic: 'logistics' },
    ],
    bundledPluginIds: ['aid-board', 'meeting-notes'],
};

test('parseCoalitionKitManifest validates and normalizes', () => {
    const m = parseCoalitionKitManifest(rawManifest);
    assert.equal(m.kitId, 'organizer-starter');
    assert.equal(m.archetype, 'organizer');
    assert.equal(m.dens.length, 2);
    assert.equal(m.customization.activePreset, 'governance');
    assert.deepEqual(m.bundledPluginIds, ['aid-board', 'meeting-notes']);
});

test('parseCoalitionKitManifest rejects a bad archetype', () => {
    assert.throws(() => parseCoalitionKitManifest({ ...rawManifest, archetype: 'nope' }), /archetype/);
});

test('applyCoalitionKitManifest installs plugins at coalition scope, provisions dens, and is idempotent', async () => {
    const manifest = parseCoalitionKitManifest(rawManifest);
    const fakeProvisioner = async (spec: { slug: string }) => ({
        ok: true as const,
        denId: `!den-${spec.slug}:test`,
    });

    const first = await applyCoalitionKitManifest(
        { coalitionId: 'coa-kit-1', manifest, appliedByUserId: COORDINATOR_ID },
        fakeProvisioner,
    );
    assert.equal(first.alreadyApplied, false);
    assert.equal(first.application.denIds.length, 2);
    assert.deepEqual(first.application.bundledPluginIds, ['aid-board', 'meeting-notes']);

    // Bundled plugins landed at coalition scope as `available` (per-den opt-in).
    const installs = listInstallationsForScope({ type: 'coalition', id: 'coa-kit-1' });
    assert.equal(installs.length, 2);
    assert.ok(installs.every((i) => i.status === 'available'));

    // Re-applying returns the existing application without duplicating.
    const second = await applyCoalitionKitManifest(
        { coalitionId: 'coa-kit-1', manifest, appliedByUserId: COORDINATOR_ID },
        fakeProvisioner,
    );
    assert.equal(second.alreadyApplied, true);
    assert.equal(listCoalitionKitManifestApplications('coa-kit-1').length, 1);
});

test('applyCoalitionKitManifest records den provisioning failures', async () => {
    const manifest = parseCoalitionKitManifest(rawManifest);
    const failing = async () => ({ ok: false as const, reason: 'matrix_not_configured' });
    const result = await applyCoalitionKitManifest(
        { coalitionId: 'coa-kit-2', manifest, appliedByUserId: COORDINATOR_ID },
        failing,
    );
    assert.equal(result.application.denIds.length, 0);
    assert.equal(result.denFailures.length, 2);
});

test('coalition-kit routes 404 when the flag is off', async () => {
    const res = await app.request('/v1/coalition-kit-manifests/coa-x', { headers: headers(COORDINATOR_ID) });
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as { code: string }).code, 'feature_disabled');
});

test('apply route enforces governance for a paid kit', async () => {
    process.env.BLACKOUT_COALITION_KIT_MANIFESTS = 'true';
    process.env.BLACKOUT_PLUGIN_SCOPE_GOVERNANCE = 'true';
    try {
        const res = await app.request('/v1/coalition-kit-manifests/coa-paid/apply', {
            method: 'POST',
            headers: headers(COORDINATOR_ID),
            body: JSON.stringify({ manifest: rawManifest, isPaid: true }),
        });
        assert.equal(res.status, 403);
        assert.equal(((await res.json()) as { code: string }).code, 'governance_required');

        db.createVote({
            id: 'ck-vote',
            communityId: 'coa-paid',
            proposerId: COORDINATOR_ID,
            title: 'Apply organizer kit',
            voteType: 'yes_no',
            options: [{ id: 'yes', text: 'Yes' }],
            requiresQuorum: 50,
            durationHours: 168,
            status: 'passed',
        });
        const ok = await app.request('/v1/coalition-kit-manifests/coa-paid/apply', {
            method: 'POST',
            headers: headers(COORDINATOR_ID),
            body: JSON.stringify({ manifest: rawManifest, isPaid: true, governanceProposalId: 'ck-vote' }),
        });
        assert.ok(ok.status === 201 || ok.status === 207, `expected applied, got ${ok.status}`);
    } finally {
        process.env.BLACKOUT_COALITION_KIT_MANIFESTS = '';
        process.env.BLACKOUT_PLUGIN_SCOPE_GOVERNANCE = '';
    }
});
