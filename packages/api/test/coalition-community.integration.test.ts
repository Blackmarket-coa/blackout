import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');

function authHeader(): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt('community-test-user', 'community', 600)}`,
        'content-type': 'application/json',
    };
}

function otherUserAuthHeader(): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt('community-test-other', 'community', 600)}`,
        'content-type': 'application/json',
    };
}

const CANOPY = '!canopy-community-test:blackout';

// --- Needs Board ---

test('coalition needs: create, list, update lifecycle', async () => {
    const created = await app.request('/v1/coalition/needs', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ canopyId: CANOPY, kind: 'compost', title: 'Need compost' }),
    });
    assert.equal(created.status, 201);
    const { need } = (await created.json()) as {
        need: { id: string; status: string; authorId: string };
    };
    assert.equal(need.status, 'open');
    assert.equal(need.authorId, 'community-test-user');

    const listed = await app.request(`/v1/coalition/needs?canopyId=${encodeURIComponent(CANOPY)}`, {
        headers: authHeader(),
    });
    assert.equal(listed.status, 200);
    const { needs } = (await listed.json()) as { needs: Array<{ id: string }> };
    assert.ok(needs.some((n) => n.id === need.id));

    const patched = await app.request(`/v1/coalition/needs/${need.id}`, {
        method: 'PATCH',
        headers: authHeader(),
        body: JSON.stringify({ status: 'fulfilled', fulfilledByListingId: 'fbm:listing:42' }),
    });
    assert.equal(patched.status, 200);
    const { need: updated } = (await patched.json()) as {
        need: { status: string; fulfilledByListingId: string };
    };
    assert.equal(updated.status, 'fulfilled');
    assert.equal(updated.fulfilledByListingId, 'fbm:listing:42');
});

test('coalition needs: write requires auth', async () => {
    const res = await app.request('/v1/coalition/needs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canopyId: CANOPY, kind: 'creator', title: 'Need creator' }),
    });
    assert.equal(res.status, 401);
});

test('coalition needs: non-author cannot update (403)', async () => {
    const created = await app.request('/v1/coalition/needs', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ canopyId: CANOPY, kind: 'compost', title: 'Owned need' }),
    });
    assert.equal(created.status, 201);
    const { need } = (await created.json()) as { need: { id: string } };

    const patched = await app.request(`/v1/coalition/needs/${need.id}`, {
        method: 'PATCH',
        headers: otherUserAuthHeader(),
        body: JSON.stringify({ status: 'fulfilled' }),
    });
    assert.equal(patched.status, 403);
});

test('coalition needs: patch unknown id is 404', async () => {
    const res = await app.request('/v1/coalition/needs/need_does_not_exist', {
        method: 'PATCH',
        headers: authHeader(),
        body: JSON.stringify({ status: 'closed' }),
    });
    assert.equal(res.status, 404);
});

// --- Projects ---

test('coalition projects: create, list, status update', async () => {
    const created = await app.request('/v1/coalition/projects', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
            canopyId: CANOPY,
            title: 'Community garden',
            category: 'community_garden',
        }),
    });
    assert.equal(created.status, 201);
    const { project } = (await created.json()) as {
        project: { id: string; status: string; leadId: string };
    };
    assert.equal(project.status, 'proposed');
    assert.equal(project.leadId, 'community-test-user');

    const patched = await app.request(`/v1/coalition/projects/${project.id}`, {
        method: 'PATCH',
        headers: authHeader(),
        body: JSON.stringify({ status: 'active' }),
    });
    assert.equal(patched.status, 200);
    const { project: updated } = (await patched.json()) as { project: { status: string } };
    assert.equal(updated.status, 'active');
});

// --- Resource Registry ---

test('coalition resources: create, list, availability update', async () => {
    const created = await app.request('/v1/coalition/resources', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
            canopyId: CANOPY,
            name: 'Shared greenhouse',
            kind: 'greenhouse',
            location: '12 Garden Row',
        }),
    });
    assert.equal(created.status, 201);
    const { resource } = (await created.json()) as {
        resource: { id: string; availability: string; stewardId: string };
    };
    assert.equal(resource.availability, 'available');
    assert.equal(resource.stewardId, 'community-test-user');

    const patched = await app.request(`/v1/coalition/resources/${resource.id}`, {
        method: 'PATCH',
        headers: authHeader(),
        body: JSON.stringify({ availability: 'in_use' }),
    });
    assert.equal(patched.status, 200);
    const { resource: updated } = (await patched.json()) as { resource: { availability: string } };
    assert.equal(updated.availability, 'in_use');
});

test('coalition resources: rejects invalid availability', async () => {
    const res = await app.request('/v1/coalition/resources', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ canopyId: CANOPY, name: 'X', kind: 'tool', availability: 'nope' }),
    });
    assert.equal(res.status, 400);
});

test('coalition resources: non-steward cannot update availability (403)', async () => {
    const created = await app.request('/v1/coalition/resources', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ canopyId: CANOPY, name: 'Owned tool', kind: 'tool' }),
    });
    assert.equal(created.status, 201);
    const { resource } = (await created.json()) as { resource: { id: string } };

    const patched = await app.request(`/v1/coalition/resources/${resource.id}`, {
        method: 'PATCH',
        headers: otherUserAuthHeader(),
        body: JSON.stringify({ availability: 'in_use' }),
    });
    assert.equal(patched.status, 403);
});
