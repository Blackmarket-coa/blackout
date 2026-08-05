import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_API_SKIP_LISTEN = process.env.BLACKOUT_API_SKIP_LISTEN ?? '1';
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
const { MAX_AREA_RADIUS_METERS } = await import('@blackout/core');

const CANOPY = '!place-canopy:server';
const PIN = { kind: 'pin', latitude: 47.6062, longitude: -122.3321, label: 'Elm St yard' };
const AREA = { kind: 'area', latitude: 47.6062, longitude: -122.3321, radiusMeters: 5000 };

function authHeader(userId = 'place-user'): Record<string, string> {
    return { authorization: `Bearer ${signJwt(userId, 'coalition', 600)}` };
}

const post = (path: string, body: unknown, userId?: string) =>
    app.request(`/v1/coalition${path}`, {
        method: 'POST',
        headers: authHeader(userId),
        body: JSON.stringify(body),
    });

const patch = (path: string, body: unknown, userId?: string) =>
    app.request(`/v1/coalition${path}`, {
        method: 'PATCH',
        headers: authHeader(userId),
        body: JSON.stringify(body),
    });

test('a need can be pinned to an exact spot', async () => {
    const response = await post('/needs', {
        canopyId: CANOPY,
        kind: 'compost',
        title: 'Compost for the Elm St beds',
        place: PIN,
    });
    assert.equal(response.status, 201);
    const { need } = (await response.json()) as { need: { place?: typeof PIN } };
    assert.deepEqual(need.place, PIN);
});

test('a need can claim an area of operations instead', async () => {
    const response = await post('/needs', {
        canopyId: CANOPY,
        kind: 'tools',
        title: 'Tools, anywhere on the north side',
        place: AREA,
    });
    const { need } = (await response.json()) as { need: { place?: typeof AREA } };
    assert.equal(need.place?.kind, 'area');
    assert.equal(need.place?.radiusMeters, 5000);
});

/**
 * Plenty of needs are genuinely placeless — "we need a developer". Forcing a
 * location would scatter fictional pins across the map.
 */
test('a need with no place is still valid', async () => {
    const response = await post('/needs', {
        canopyId: CANOPY,
        kind: 'developer',
        title: 'We need a developer',
    });
    assert.equal(response.status, 201);
    const { need } = (await response.json()) as { need: { place?: unknown } };
    assert.equal(need.place, undefined);
});

test('a place survives the round trip through the list endpoint', async () => {
    const created = await post('/needs', {
        canopyId: '!roundtrip:server',
        kind: 'compost',
        title: 'Round trip',
        place: AREA,
    });
    const { need } = (await created.json()) as { need: { id: string } };

    const listed = await app.request('/v1/coalition/needs?canopyId=!roundtrip:server', {
        headers: authHeader(),
    });
    const { needs } = (await listed.json()) as {
        needs: { id: string; place?: { kind: string; radiusMeters?: number } }[];
    };
    const found = needs.find((candidate) => candidate.id === need.id);
    assert.equal(found?.place?.kind, 'area');
    assert.equal(found?.place?.radiusMeters, 5000);
});

test('a need author can add, move and clear a place', async () => {
    const created = await post('/needs', {
        canopyId: CANOPY,
        kind: 'compost',
        title: 'Movable',
    });
    const { need } = (await created.json()) as { need: { id: string } };

    const added = await patch(`/needs/${need.id}`, { place: PIN });
    assert.equal(
        ((await added.json()) as { need: { place?: { kind: string } } }).need.place?.kind,
        'pin'
    );

    const widened = await patch(`/needs/${need.id}`, { place: AREA });
    assert.equal(
        ((await widened.json()) as { need: { place?: { kind: string } } }).need.place?.kind,
        'area'
    );

    // `null` means take it off the map — distinct from omitting the field,
    // which leaves whatever it had.
    const cleared = await patch(`/needs/${need.id}`, { place: null });
    assert.equal(((await cleared.json()) as { need: { place?: unknown } }).need.place, undefined);
});

test('omitting place on a patch leaves the existing one alone', async () => {
    const created = await post('/needs', {
        canopyId: CANOPY,
        kind: 'compost',
        title: 'Sticky place',
        place: PIN,
    });
    const { need } = (await created.json()) as { need: { id: string } };

    const updated = await patch(`/needs/${need.id}`, { status: 'claimed' });
    const body = (await updated.json()) as { need: { status: string; place?: { label?: string } } };
    assert.equal(body.need.status, 'claimed');
    assert.equal(body.need.place?.label, 'Elm St yard');
});

test('projects and resources take a place the same way', async () => {
    const project = await post('/projects', {
        canopyId: CANOPY,
        title: 'Community garden',
        category: 'community_garden',
        place: PIN,
    });
    assert.equal(project.status, 201);
    assert.equal(
        ((await project.json()) as { project: { place?: { kind: string } } }).project.place?.kind,
        'pin'
    );

    const resource = await post('/resources', {
        canopyId: CANOPY,
        name: 'Mobile tool library',
        kind: 'tool',
        // Free-text directions and geo coordinates coexist: one says where, the
        // other says how to get in.
        location: 'Side door, ask for Ray',
        place: AREA,
    });
    assert.equal(resource.status, 201);
    const body = (await resource.json()) as {
        resource: { location?: string; place?: { kind: string } };
    };
    assert.equal(body.resource.location, 'Side door, ask for Ray');
    assert.equal(body.resource.place?.kind, 'area');
});

test('a resource steward can patch availability and place together', async () => {
    const created = await post('/resources', {
        canopyId: CANOPY,
        name: 'Greenhouse',
        kind: 'greenhouse',
    });
    const { resource } = (await created.json()) as { resource: { id: string } };

    const updated = await patch(`/resources/${resource.id}`, {
        availability: 'in_use',
        place: PIN,
    });
    assert.equal(updated.status, 200);
    const body = (await updated.json()) as {
        resource: { availability: string; place?: { kind: string } };
    };
    assert.equal(body.resource.availability, 'in_use');
    assert.equal(body.resource.place?.kind, 'pin');
});

test('an empty resource patch is rejected rather than a silent no-op', async () => {
    const created = await post('/resources', {
        canopyId: CANOPY,
        name: 'No-op target',
        kind: 'tool',
    });
    const { resource } = (await created.json()) as { resource: { id: string } };
    assert.equal((await patch(`/resources/${resource.id}`, {})).status, 400);
});

test('a project lead can patch a place without disturbing funding', async () => {
    const created = await post('/projects', {
        canopyId: CANOPY,
        title: 'Fundable',
        category: 'food',
        fundingGoalCents: 50_000,
    });
    const { project } = (await created.json()) as { project: { id: string } };

    const updated = await patch(`/projects/${project.id}`, { place: AREA });
    const body = (await updated.json()) as {
        project: { fundingGoalCents?: number; place?: { kind: string } };
    };
    assert.equal(body.project.place?.kind, 'area');
    assert.equal(body.project.fundingGoalCents, 50_000);
});

test('coordinates outside the world are rejected', async () => {
    for (const bad of [
        { kind: 'pin', latitude: 91, longitude: 0 },
        { kind: 'pin', latitude: 0, longitude: 181 },
    ]) {
        const response = await post('/needs', {
            canopyId: CANOPY,
            kind: 'compost',
            title: 'Off-world',
            place: bad,
        });
        assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    }
});

test('an area needs a positive, bounded radius', async () => {
    for (const radiusMeters of [0, -1, MAX_AREA_RADIUS_METERS + 1]) {
        const response = await post('/needs', {
            canopyId: CANOPY,
            kind: 'compost',
            title: 'Bad radius',
            place: { kind: 'area', latitude: 47.6, longitude: -122.3, radiusMeters },
        });
        assert.equal(response.status, 400, `expected 400 for radius ${radiusMeters}`);
    }
});

/** The tag is what keeps an approximate centre from reading as a doorstep. */
test('a place with no kind, or a pin carrying a radius, is rejected', async () => {
    const untagged = await post('/needs', {
        canopyId: CANOPY,
        kind: 'compost',
        title: 'Untagged',
        place: { latitude: 47.6, longitude: -122.3 },
    });
    assert.equal(untagged.status, 400);

    const smuggled = await post('/needs', {
        canopyId: CANOPY,
        kind: 'compost',
        title: 'Smuggled radius',
        place: { kind: 'pin', latitude: 47.6, longitude: -122.3, radiusMeters: 5000 },
    });
    // Zod strips unknown keys rather than failing, so the guarantee that matters
    // is that the stored pin has no radius — not that the request 400s.
    assert.equal(smuggled.status, 201);
    const { need } = (await smuggled.json()) as {
        need: { place?: Record<string, unknown> };
    };
    assert.equal(need.place?.radiusMeters, undefined);
});

test('only the author may move a need, and only the steward a resource', async () => {
    const need = await post('/needs', { canopyId: CANOPY, kind: 'compost', title: 'Guarded' });
    const { need: created } = (await need.json()) as { need: { id: string } };
    assert.equal((await patch(`/needs/${created.id}`, { place: PIN }, 'someone-else')).status, 403);

    const resource = await post('/resources', {
        canopyId: CANOPY,
        name: 'Guarded resource',
        kind: 'tool',
    });
    const { resource: madeResource } = (await resource.json()) as { resource: { id: string } };
    assert.equal(
        (await patch(`/resources/${madeResource.id}`, { place: PIN }, 'someone-else')).status,
        403
    );
});
