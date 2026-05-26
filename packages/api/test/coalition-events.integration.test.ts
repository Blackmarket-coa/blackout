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
const { expandOccurrences, nextOccurrence, summarizeRsvps } = await import('@blackout/core');

function authHeader(user = 'event-organizer'): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(user, 'coalition', 600)}`,
        'content-type': 'application/json',
    };
}

// --- core domain helpers ---

test('expandOccurrences yields one occurrence for a non-recurring event', () => {
    const occ = expandOccurrences(
        { startsAt: '2026-06-01T18:00:00.000Z', endsAt: '2026-06-01T20:00:00.000Z' },
        Date.parse('2026-05-01T00:00:00Z'),
        Date.parse('2026-07-01T00:00:00Z'),
        Date.parse('2026-05-15T00:00:00Z'),
    );
    assert.equal(occ.length, 1);
    assert.equal(occ[0]?.status, 'upcoming');
});

test('expandOccurrences honours weekly recurrence with a count bound', () => {
    const occ = expandOccurrences(
        {
            startsAt: '2026-06-01T18:00:00.000Z',
            endsAt: '2026-06-01T19:00:00.000Z',
            recurrence: { frequency: 'weekly', interval: 1, count: 3 },
        },
        Date.parse('2026-06-01T00:00:00Z'),
        Date.parse('2026-12-01T00:00:00Z'),
        Date.parse('2026-06-01T00:00:00Z'),
    );
    assert.equal(occ.length, 3);
    assert.equal(occ[1]?.startsAt, '2026-06-08T18:00:00.000Z');
    assert.equal(occ[2]?.startsAt, '2026-06-15T18:00:00.000Z');
});

test('summarizeRsvps tallies by status', () => {
    const summary = summarizeRsvps([
        { status: 'going' },
        { status: 'going' },
        { status: 'maybe' },
        { status: 'declined' },
    ]);
    assert.deepEqual(summary, { going: 2, maybe: 1, declined: 1 });
});

// --- routes ---

const baseEvent = {
    title: 'Neighborhood cleanup',
    description: 'Bring gloves and bags.',
    location: { latitude: 40.71, longitude: -74.0, address: 'Riverside Park' },
    startsAt: '2030-06-01T15:00:00.000Z',
    endsAt: '2030-06-01T18:00:00.000Z',
    category: 'cleanup',
};

async function createEvent(body: Record<string, unknown> = {}, user = 'event-organizer') {
    const res = await app.request('/v1/coalition/events', {
        method: 'POST',
        headers: authHeader(user),
        body: JSON.stringify({ ...baseEvent, ...body }),
    });
    return res;
}

test('POST /events requires auth', async () => {
    const res = await app.request('/v1/coalition/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(baseEvent),
    });
    assert.equal(res.status, 401);
});

test('event lifecycle: create, list, detail, rsvp, map surfacing', async () => {
    const created = await createEvent();
    assert.equal(created.status, 201);
    const { event } = (await created.json()) as { event: { id: string; status: string } };
    assert.ok(event.id);
    assert.equal(event.status, 'scheduled');

    // list includes rsvpSummary + nextOccurrence
    const listRes = await app.request('/v1/coalition/events', { headers: authHeader() });
    const { events } = (await listRes.json()) as {
        events: Array<{ id: string; rsvpSummary: { going: number }; nextOccurrence?: unknown }>;
    };
    const listed = events.find((e) => e.id === event.id);
    assert.ok(listed, 'created event should appear in list');
    assert.equal(listed?.rsvpSummary.going, 0);
    assert.ok(listed?.nextOccurrence, 'upcoming event has a next occurrence');

    // rsvp going
    const rsvpRes = await app.request(`/v1/coalition/events/${event.id}/rsvp`, {
        method: 'POST',
        headers: authHeader('attendee-1'),
        body: JSON.stringify({ status: 'going' }),
    });
    assert.equal(rsvpRes.status, 200);
    const rsvpBody = (await rsvpRes.json()) as { rsvpSummary: { going: number } };
    assert.equal(rsvpBody.rsvpSummary.going, 1);

    // detail reflects the rsvp + has occurrences
    const detailRes = await app.request(`/v1/coalition/events/${event.id}`, { headers: authHeader() });
    const detail = (await detailRes.json()) as {
        rsvpSummary: { going: number };
        occurrences: unknown[];
    };
    assert.equal(detail.rsvpSummary.going, 1);
    assert.equal(detail.occurrences.length, 1);

    // surfaced on the spatial map 'events' layer
    const mapRes = await app.request('/v1/coalition/spatial-feed?layers=events', {
        headers: authHeader(),
    });
    const map = (await mapRes.json()) as { items: Array<{ id: string; layer: string }> };
    assert.ok(
        map.items.some((i) => i.id === `event:${event.id}` && i.layer === 'events'),
        'event should appear as an events-layer map pin',
    );
});

test('only the organizer can edit; cancel hides the event from the map', async () => {
    const created = await createEvent();
    const { event } = (await created.json()) as { event: { id: string } };

    const forbidden = await app.request(`/v1/coalition/events/${event.id}`, {
        method: 'PATCH',
        headers: authHeader('someone-else'),
        body: JSON.stringify({ status: 'cancelled' }),
    });
    assert.equal(forbidden.status, 403);

    const cancelled = await app.request(`/v1/coalition/events/${event.id}`, {
        method: 'PATCH',
        headers: authHeader('event-organizer'),
        body: JSON.stringify({ status: 'cancelled' }),
    });
    assert.equal(cancelled.status, 200);
    const body = (await cancelled.json()) as { event: { status: string } };
    assert.equal(body.event.status, 'cancelled');

    const mapRes = await app.request('/v1/coalition/spatial-feed?layers=events', {
        headers: authHeader(),
    });
    const map = (await mapRes.json()) as { items: Array<{ id: string }> };
    assert.ok(
        !map.items.some((i) => i.id === `event:${event.id}`),
        'cancelled events drop off the map',
    );
});

test('recurring event exposes multiple occurrences in its detail', async () => {
    const created = await createEvent({
        title: 'Weekly food share',
        startsAt: '2030-07-01T15:00:00.000Z',
        endsAt: '2030-07-01T17:00:00.000Z',
        recurrence: { frequency: 'weekly', interval: 1, count: 4 },
    });
    const { event } = (await created.json()) as { event: { id: string; recurrence: unknown } };
    assert.ok(event.recurrence, 'recurrence persisted');
    const detailRes = await app.request(`/v1/coalition/events/${event.id}`, { headers: authHeader() });
    const detail = (await detailRes.json()) as { occurrences: unknown[] };
    assert.ok(detail.occurrences.length >= 2, 'recurring event expands to multiple occurrences');
});

test('nextOccurrence skips fully-past occurrences', () => {
    const occ = nextOccurrence(
        { startsAt: '2020-01-01T00:00:00.000Z', endsAt: '2020-01-01T01:00:00.000Z' },
        Date.parse('2026-01-01T00:00:00Z'),
    );
    assert.equal(occ?.status, 'past');
});

// --- volunteer slots ---

test('volunteer slots: organizer creates, attendees fill to capacity, then withdraw', async () => {
    const created = await createEvent({ title: 'Build day' });
    const { event } = (await created.json()) as { event: { id: string } };

    // non-organizer cannot add a slot
    const forbidden = await app.request(`/v1/coalition/events/${event.id}/volunteer-slots`, {
        method: 'POST',
        headers: authHeader('rando'),
        body: JSON.stringify({ role: 'Setup', capacity: 1 }),
    });
    assert.equal(forbidden.status, 403);

    const slotRes = await app.request(`/v1/coalition/events/${event.id}/volunteer-slots`, {
        method: 'POST',
        headers: authHeader('event-organizer'),
        body: JSON.stringify({ role: 'Setup crew', capacity: 1 }),
    });
    assert.equal(slotRes.status, 201);
    const { slot } = (await slotRes.json()) as { slot: { id: string } };

    const signup = await app.request(
        `/v1/coalition/events/${event.id}/volunteer-slots/${slot.id}/signup`,
        { method: 'POST', headers: authHeader('vol-1') },
    );
    assert.equal(signup.status, 200);

    // capacity is 1 — a second distinct volunteer is rejected
    const full = await app.request(
        `/v1/coalition/events/${event.id}/volunteer-slots/${slot.id}/signup`,
        { method: 'POST', headers: authHeader('vol-2') },
    );
    assert.equal(full.status, 409);

    // list shows it filled with no remaining capacity
    const listRes = await app.request(`/v1/coalition/events/${event.id}/volunteer-slots`, {
        headers: authHeader(),
    });
    const { slots } = (await listRes.json()) as {
        slots: Array<{ id: string; filled: number; remaining: number }>;
    };
    const listed = slots.find((s) => s.id === slot.id);
    assert.equal(listed?.filled, 1);
    assert.equal(listed?.remaining, 0);

    // vol-1 withdraws → seat frees up, vol-2 can now join
    await app.request(`/v1/coalition/events/${event.id}/volunteer-slots/${slot.id}/withdraw`, {
        method: 'POST',
        headers: authHeader('vol-1'),
    });
    const retry = await app.request(
        `/v1/coalition/events/${event.id}/volunteer-slots/${slot.id}/signup`,
        { method: 'POST', headers: authHeader('vol-2') },
    );
    assert.equal(retry.status, 200);
});

// --- ride coordination ---

test('ride coordination: offer seats, claim to capacity, release frees a seat', async () => {
    const created = await createEvent({ title: 'Rally' });
    const { event } = (await created.json()) as { event: { id: string } };

    const offerRes = await app.request(`/v1/coalition/events/${event.id}/rides`, {
        method: 'POST',
        headers: authHeader('driver-1'),
        body: JSON.stringify({ originLabel: 'North lot', seatsTotal: 1, departAt: '2030-06-01T13:00:00.000Z' }),
    });
    assert.equal(offerRes.status, 201);
    const { offer } = (await offerRes.json()) as { offer: { id: string } };

    const claim = await app.request(`/v1/coalition/events/${event.id}/rides/${offer.id}/claim`, {
        method: 'POST',
        headers: authHeader('rider-1'),
    });
    assert.equal(claim.status, 200);

    const full = await app.request(`/v1/coalition/events/${event.id}/rides/${offer.id}/claim`, {
        method: 'POST',
        headers: authHeader('rider-2'),
    });
    assert.equal(full.status, 409);

    const listRes = await app.request(`/v1/coalition/events/${event.id}/rides`, {
        headers: authHeader(),
    });
    const { offers } = (await listRes.json()) as {
        offers: Array<{ id: string; claimed: number; seatsRemaining: number }>;
    };
    const listed = offers.find((o) => o.id === offer.id);
    assert.equal(listed?.claimed, 1);
    assert.equal(listed?.seatsRemaining, 0);

    await app.request(`/v1/coalition/events/${event.id}/rides/${offer.id}/release`, {
        method: 'POST',
        headers: authHeader('rider-1'),
    });
    const retry = await app.request(`/v1/coalition/events/${event.id}/rides/${offer.id}/claim`, {
        method: 'POST',
        headers: authHeader('rider-2'),
    });
    assert.equal(retry.status, 200);
});
