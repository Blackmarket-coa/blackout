// What the coalition reads show to whom (services/coalitionVisibility.ts).
//
// Until 2026-11-17 every coalition read answered anyone, signed in or not,
// with everything stored: a mutual-aid post's exact spot and address with its
// poster's id, private events, full RSVP lists, ride offers naming the driver,
// and the people behind each need, project, resource and contribution. These
// tests ask as a stranger, as another member, and as the owner.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { coarsenPoint, MIN_AID_CELL_METERS } = await import('../src/services/coalitionVisibility');
const { recordProjectSupport } = await import('../src/services/coalitionProjectSupport');

const headers = (user: string) => ({
    authorization: `Bearer ${signJwt(user, 'coalition', 600)}`,
    'content-type': 'application/json',
});
const get = (path: string, user?: string) =>
    app.request(`/v1/coalition${path}`, user ? { headers: headers(user) } : undefined);
const post = (path: string, body: unknown, user: string) =>
    app.request(`/v1/coalition${path}`, {
        method: 'POST',
        headers: headers(user),
        body: JSON.stringify(body),
    });

// A spot about 170 m north and 100 m east of the centre of its 500 m cell:
// in the same cell, but not at its centre.
const CENTRE = coarsenPoint(51.5007, -0.1246, MIN_AID_CELL_METERS);
const SPOT = { latitude: CENTRE.latitude + 0.0015, longitude: CENTRE.longitude + 0.0015 };

type AidRow = {
    id: string;
    customerId?: string;
    location?: { latitude: number; longitude: number; address?: string };
    displayRadiusMeters: number;
};

async function postAid(user: string) {
    const response = await post(
        '/mutual-aid',
        {
            type: 'need',
            category: 'food',
            title: 'Groceries for the week',
            description: 'Can someone drop off a bag?',
            location: { ...SPOT, address: '12 Hidden Lane' },
            displayRadiusMeters: 100,
            urgency: 'medium',
        },
        user
    );
    assert.equal(response.status, 201);
    return ((await response.json()) as { post: { id: string } }).post.id;
}

const aidRows = async (query: string, user?: string) =>
    ((await (await get(`/mutual-aid${query}`, user)).json()) as { posts: AidRow[] }).posts;

test("someone else's mutual-aid post: no poster, no address, a cell instead of the spot", async () => {
    const id = await postAid('aid-poster');
    for (const viewer of [undefined, 'another-member']) {
        const row = (await aidRows('', viewer)).find((p) => p.id === id);
        assert.ok(row, 'the post is listed');
        assert.equal(row.customerId, undefined, 'no poster id');
        assert.equal(row.location?.address, undefined, 'no street address');
        assert.ok(Math.abs(row.location!.latitude - CENTRE.latitude) < 1e-9);
        assert.ok(Math.abs(row.location!.longitude - CENTRE.longitude) < 1e-9);
        assert.equal(row.displayRadiusMeters, MIN_AID_CELL_METERS);
    }
    const own = (await aidRows('', 'aid-poster')).find((p) => p.id === id);
    assert.equal(own?.customerId, 'aid-poster');
    assert.deepEqual(own?.location, { ...SPOT, address: '12 Hidden Lane' });
});

test('smaller and smaller circles do not find the spot', async () => {
    const id = await postAid('aid-poster-2');
    const atSpot = `?lat=${SPOT.latitude}&lng=${SPOT.longitude}&radiusKm=0.05`;
    assert.equal(
        (await aidRows(atSpot)).some((p) => p.id === id),
        false,
        'a 50 m circle on the spot misses it: the test is run on the cell'
    );
    const atCentre = `?lat=${CENTRE.latitude}&lng=${CENTRE.longitude}&radiusKm=0.05`;
    assert.equal(
        (await aidRows(atCentre)).some((p) => p.id === id),
        true
    );

    const nearby = (await (await get(`/nearby${atSpot}`)).json()) as {
        signals: Array<{ kind: string; id: string }>;
    };
    assert.equal(
        nearby.signals.some((s) => s.kind === 'aid' && s.id === id),
        false
    );
});

const EVENT = {
    title: 'Planning meeting',
    description: 'Upstairs room.',
    location: { latitude: 41.881, longitude: -87.623, address: '9 Quiet Street' },
    startsAt: '2030-06-01T15:00:00.000Z',
    endsAt: '2030-06-01T17:00:00.000Z',
    category: 'cleanup',
};

async function createEvent(visibility: 'public' | 'community' | 'private', user: string) {
    const response = await post('/events', { ...EVENT, visibility }, user);
    assert.equal(response.status, 201);
    return ((await response.json()) as { event: { id: string } }).event.id;
}

test('a private event is seen only by its organizer and the people who RSVP', async () => {
    for (const visibility of ['private', 'community'] as const) {
        const id = await createEvent(visibility, 'organizer-a');
        const pins = async (user?: string) =>
            (
                (await (await get('/spatial-feed?layers=events', user)).json()) as {
                    items: Array<{ id: string }>;
                }
            ).items.map((item) => item.id);
        const listed = async (user?: string) =>
            (
                (await (await get('/events', user)).json()) as { events: Array<{ id: string }> }
            ).events.map((event) => event.id);

        for (const stranger of [undefined, 'stranger-b']) {
            assert.equal((await pins(stranger)).includes(`event:${id}`), false);
            assert.equal((await listed(stranger)).includes(id), false);
            assert.equal((await get(`/events/${id}`, stranger)).status, 404);
            const near = (await (
                await get(
                    `/nearby?lat=${EVENT.location.latitude}&lng=${EVENT.location.longitude}&radiusKm=1`,
                    stranger
                )
            ).json()) as { signals: Array<{ id: string }> };
            assert.equal(
                near.signals.some((s) => s.id === `event:${id}`),
                false
            );
        }
        // A stranger cannot RSVP their way in.
        assert.equal(
            (await post(`/events/${id}/rsvp`, { status: 'going' }, 'stranger-b')).status,
            404
        );

        assert.equal((await pins('organizer-a')).includes(`event:${id}`), true);
        assert.equal((await listed('organizer-a')).includes(id), true);
        assert.equal((await get(`/events/${id}`, 'organizer-a')).status, 200);
    }
});

test("an event's RSVP list is its organizer's; others see their own", async () => {
    const id = await createEvent('public', 'organizer-c');
    for (const user of ['guest-d', 'guest-e']) {
        assert.equal((await post(`/events/${id}/rsvp`, { status: 'going' }, user)).status, 200);
    }
    type Detail = {
        event: { organizerId?: string };
        rsvps: Array<{ userId: string }>;
        rsvpSummary: { going: number };
    };
    const detail = async (user?: string) =>
        (await (await get(`/events/${id}`, user)).json()) as Detail;

    const anonymous = await detail();
    assert.equal(anonymous.event.organizerId, undefined, 'no organizer id for someone signed out');
    assert.deepEqual(anonymous.rsvps, []);
    assert.equal(anonymous.rsvpSummary.going, 2, 'the count is still public');

    assert.deepEqual(
        (await detail('guest-d')).rsvps.map((r) => r.userId),
        ['guest-d']
    );
    assert.deepEqual((await detail('organizer-c')).rsvps.map((r) => r.userId).sort(), [
        'guest-d',
        'guest-e',
    ]);
    assert.equal((await detail('guest-d')).event.organizerId, 'organizer-c');
});

test('rides and volunteer slots need sign-in, and a private event stays hidden', async () => {
    const publicId = await createEvent('public', 'organizer-f');
    assert.equal((await get(`/events/${publicId}/rides`)).status, 401);
    assert.equal((await get(`/events/${publicId}/volunteer-slots`)).status, 401);
    assert.equal((await get(`/events/${publicId}/rides`, 'member-g')).status, 200);

    const privateId = await createEvent('private', 'organizer-f');
    assert.equal((await get(`/events/${privateId}/rides`, 'member-g')).status, 404);
    assert.equal((await get(`/events/${privateId}/volunteer-slots`, 'member-g')).status, 404);
    assert.equal(
        (
            await post(
                `/events/${privateId}/rides`,
                { originLabel: 'Corner store', seatsTotal: 2 },
                'member-g'
            )
        ).status,
        404
    );
    assert.equal((await get(`/events/${privateId}/rides`, 'organizer-f')).status, 200);
});

test('signed out, needs, projects, resources and contributions name no one', async () => {
    const canopyId = '!privacy-canopy:server';
    assert.equal(
        (await post('/needs', { canopyId, kind: 'food', title: 'Rice' }, 'author-h')).status,
        201
    );
    const projectResponse = await post(
        '/projects',
        { canopyId, title: 'Tool shed', category: 'community_garden' },
        'lead-i'
    );
    assert.equal(projectResponse.status, 201);
    const projectId = ((await projectResponse.json()) as { project: { id: string } }).project.id;
    assert.equal(
        (await post('/resources', { canopyId, name: 'Ladder', kind: 'tool' }, 'steward-j')).status,
        201
    );
    recordProjectSupport({
        projectId,
        supporterUserId: 'supporter-k',
        tipId: 'tip-privacy-1',
        amountCents: 500,
    });

    const read = async (path: string, user?: string) =>
        (await (await get(path, user)).json()) as Record<string, unknown>;
    const signedOut = {
        needs: (await read(`/needs?canopyId=${encodeURIComponent(canopyId)}`)).needs as Array<
            Record<string, unknown>
        >,
        projects: (await read(`/projects?canopyId=${encodeURIComponent(canopyId)}`))
            .projects as Array<Record<string, unknown>>,
        resources: (await read(`/resources?canopyId=${encodeURIComponent(canopyId)}`))
            .resources as Array<Record<string, unknown>>,
        view: await read(`/projects/${projectId}`),
        supporters: (await read(`/projects/${projectId}/supporters`)).supporters as Array<
            Record<string, unknown>
        >,
    };
    assert.ok(signedOut.needs.length > 0 && signedOut.needs.every((n) => !('authorId' in n)));
    assert.ok(signedOut.projects.length > 0 && signedOut.projects.every((p) => !('leadId' in p)));
    assert.ok(
        signedOut.resources.length > 0 && signedOut.resources.every((r) => !('stewardId' in r))
    );
    assert.equal('leadId' in (signedOut.view.project as Record<string, unknown>), false);
    assert.ok(
        (signedOut.view.recentSupporters as Array<Record<string, unknown>>).every(
            (s) => !('supporterUserId' in s)
        )
    );
    assert.ok(
        signedOut.supporters.length > 0 &&
            signedOut.supporters.every((s) => !('supporterUserId' in s))
    );

    // Signed in, as before.
    const member = (await read(`/needs?canopyId=${encodeURIComponent(canopyId)}`, 'member-l'))
        .needs as Array<Record<string, unknown>>;
    assert.equal(member[0]?.authorId, 'author-h');
    const supporters = (await read(`/projects/${projectId}/supporters`, 'member-l'))
        .supporters as Array<Record<string, unknown>>;
    assert.equal(supporters[0]?.supporterUserId, 'supporter-k');
});

test('a position or an address can travel in the body, out of the address bar and the access log', async () => {
    const id = await postAid('aid-poster-3');
    const body = { lat: CENTRE.latitude, lng: CENTRE.longitude, radiusKm: 0.05 };

    // The same answers as the GET forms, which still work for older clients.
    const viaBody = (await (await post('/mutual-aid/search', body, 'searcher-m')).json()) as {
        posts: AidRow[];
    };
    const viaQuery = await aidRows(
        `?lat=${body.lat}&lng=${body.lng}&radiusKm=${body.radiusKm}`,
        'searcher-m'
    );
    assert.deepEqual(viaBody.posts.map((p) => p.id).sort(), viaQuery.map((p) => p.id).sort());
    assert.ok(viaBody.posts.some((p) => p.id === id && p.customerId === undefined));

    const near = (await (await post('/nearby', body, 'searcher-m')).json()) as {
        signals: Array<{ kind: string; id: string }>;
    };
    assert.ok(near.signals.some((s) => s.kind === 'aid' && s.id === id));
    const missingRadius = await post('/nearby', { lat: 1, lng: 2 }, 'searcher-m');
    assert.equal(missingRadius.status, 400);

    const sellers = await post(
        '/seller-locations/search',
        { lat: 0, lng: 0, radiusKm: 1 },
        'searcher-m'
    );
    assert.equal(sellers.status, 200);

    // Address search: sign-in still required; with no geocoder configured the
    // answer is the same 503 the GET form gives.
    const anonymous = await app.request('/v1/coalition/geocode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: '12 Hidden Lane' }),
    });
    assert.equal(anonymous.status, 401);
    const signedIn = await post('/geocode', { q: '12 Hidden Lane' }, 'searcher-m');
    assert.equal(
        signedIn.status,
        (await get('/geocode?q=12%20Hidden%20Lane', 'searcher-m')).status
    );
});

test('a seller who hid from the map is not shown, whatever the query says', async () => {
    const { saveSellerLocation } = await import('../src/services/coalitionStore');
    saveSellerLocation({
        id: 'seller-hidden-1',
        sellerId: 'seller-user-n',
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        addressLine: '3 Private Court',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'US',
        displayRadiusMeters: 500,
        isVisible: false,
        locationType: 'home',
    } as never);
    for (const query of ['', '?onlyVisible=false']) {
        const body = (await (await get(`/seller-locations${query}`)).json()) as {
            locations: Array<{ id: string }>;
        };
        assert.equal(
            body.locations.some((l) => l.id === 'seller-hidden-1'),
            false,
            query || '(no query)'
        );
    }
});
