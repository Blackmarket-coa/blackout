import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const {
    applyAidRequestEvent,
    buildMirroredAidPost,
    mapAidCategory,
    mapAidStatus,
    FBM_AID_CUSTOMER_ID,
    FBM_AID_SOURCE,
} = await import('../src/services/fbmMatrixBridge/aidBoard');
const { parseFbmMatrixEvent } = await import('../src/services/fbmMatrixBridge/events');
const { TABLE_DESCRIPTORS } = await import('../src/db/pgDescriptors');

/**
 * A mutual-aid ask mirrored from FreeBlackMarket (`docs/CDFI_COOP_ROADMAP.md`
 * §3.8). FBM publishes its board through a whitelist projection that emits a
 * coarse `locality` and never coordinates, so a mirrored post arrives with a
 * place name and no pin — which `coalition_aid_posts` could not store, because
 * both coordinate columns were NOT NULL.
 *
 * The reason it matters that this stays coordinate-less rather than being
 * geocoded on arrival: Blackout's own `GET /v1/coalition/mutual-aid` publishes
 * rows verbatim, with no projection of its own. Whatever lands here is what the
 * world sees.
 */
const openEvent = (over: Record<string, unknown> = {}) => ({
    eventId: `evt_${Math.random().toString(36).slice(2, 10)}`,
    type: 'aid.request.opened',
    occurredAt: '2026-09-08T12:00:00.000Z',
    requestId: `mar_${Math.random().toString(36).slice(2, 10)}`,
    title: 'Ride to a dialysis appointment',
    description: 'Tuesdays and Thursdays, 8am',
    category: 'transport',
    status: 'OPEN',
    locality: 'Southwest Detroit',
    createdAt: '2026-09-08T11:00:00.000Z',
    ...over,
});

test('parseFbmMatrixEvent accepts all three aid types', () => {
    const parsed = parseFbmMatrixEvent(openEvent());
    assert.ok(parsed);
    assert.equal(parsed.type, 'aid.request.opened');

    const fulfilled = parseFbmMatrixEvent(
        openEvent({ type: 'aid.request.fulfilled', status: 'FULFILLED' })
    );
    assert.equal(fulfilled?.type, 'aid.request.fulfilled');

    const closed = parseFbmMatrixEvent(
        openEvent({ type: 'aid.request.closed', status: 'WITHDRAWN' })
    );
    assert.equal(closed?.type, 'aid.request.closed');
});

test('parseFbmMatrixEvent rejects an aid event with nothing to key or read', () => {
    // A row with no origin id cannot be deduplicated on redelivery, and one
    // with no title or description would sit on the board saying nothing.
    assert.equal(parseFbmMatrixEvent(openEvent({ requestId: undefined })), null);
    assert.equal(parseFbmMatrixEvent(openEvent({ title: undefined })), null);
    assert.equal(parseFbmMatrixEvent(openEvent({ description: undefined })), null);
});

test('a mirrored post carries a locality and no coordinates at all', () => {
    const event = parseFbmMatrixEvent(openEvent());
    assert.ok(event && 'requestId' in event);

    const post = buildMirroredAidPost(event, 'aidp_test_1');

    assert.equal(post.locality, 'Southwest Detroit');
    // Absent, not a zeroed pin: {0, 0} would put every mirrored need in the
    // Gulf of Guinea.
    assert.equal(post.location, undefined);
    assert.equal(post.displayRadiusMeters, 0);
    assert.equal(post.customerId, FBM_AID_CUSTOMER_ID);
    assert.equal(post.source, FBM_AID_SOURCE);
    assert.equal(post.externalId, event.requestId);
    // FBM's projection does not publish urgency, so the schema default stands
    // rather than a guess made on a board people read when they need help.
    assert.equal(post.urgency, 'medium');
});

test('an unrecognised category becomes `other` rather than dropping the ask', () => {
    assert.equal(mapAidCategory('food'), 'food');
    assert.equal(mapAidCategory('Tech Support'), 'tech_support');
    assert.equal(mapAidCategory('tech-support'), 'tech_support');
    assert.equal(mapAidCategory('winter coats'), 'other');
    assert.equal(mapAidCategory(undefined), 'other');
});

test('FBM statuses map onto Blackout statuses', () => {
    assert.equal(mapAidStatus('OPEN'), 'open');
    assert.equal(mapAidStatus('MATCHED'), 'in_progress');
    assert.equal(mapAidStatus('FULFILLED'), 'fulfilled');
    assert.equal(mapAidStatus('EXPIRED'), 'expired');
    // Blackout has no withdrawn state; cancelled is the honest neighbour.
    assert.equal(mapAidStatus('WITHDRAWN'), 'cancelled');
    assert.equal(mapAidStatus(undefined), 'open');
});

test('the coordinate-less post round-trips through the store', () => {
    const event = parseFbmMatrixEvent(openEvent());
    assert.ok(event && 'requestId' in event);

    const written = applyAidRequestEvent(event);
    const read = db.listCoalitionAidPosts().find((post) => post.id === written.id);

    assert.ok(read);
    assert.equal(read.location, undefined);
    assert.equal(read.locality, 'Southwest Detroit');
    assert.equal(read.externalId, event.requestId);
});

test('aid.request.closed carries the reason the ask left the board', () => {
    // Without this type an ask withdrawn on FBM sits open here indefinitely and
    // sends someone to help with something already handled — the same harm the
    // withdraw path exists to prevent.
    const withdrawn = parseFbmMatrixEvent(
        openEvent({ type: 'aid.request.closed', status: 'WITHDRAWN' })
    );
    assert.ok(withdrawn && 'requestId' in withdrawn);
    assert.equal(buildMirroredAidPost(withdrawn, 'aidp_w').status, 'cancelled');

    const lapsed = parseFbmMatrixEvent(
        openEvent({ type: 'aid.request.closed', status: 'EXPIRED' })
    );
    assert.ok(lapsed && 'requestId' in lapsed);
    assert.equal(buildMirroredAidPost(lapsed, 'aidp_e').status, 'expired');
});

test('a withdrawal closes the row already on the board', () => {
    const payload = openEvent({ title: 'Withdrawn ask' });
    const opened = parseFbmMatrixEvent(payload);
    assert.ok(opened && 'requestId' in opened);
    const first = applyAidRequestEvent(opened);
    assert.equal(first.status, 'open');

    const closed = parseFbmMatrixEvent({
        ...payload,
        eventId: 'evt_closed',
        type: 'aid.request.closed',
        status: 'WITHDRAWN',
    });
    assert.ok(closed && 'requestId' in closed);
    const after = applyAidRequestEvent(closed);

    assert.equal(after.id, first.id);
    assert.equal(after.status, 'cancelled');
    assert.equal(
        db.listCoalitionAidPosts().filter((post) => post.externalId === opened.requestId).length,
        1
    );
});

test('a fulfilled event pins the status rather than trusting the wire', () => {
    // `aid.request.fulfilled` means exactly one thing; a stale or wrong
    // `status` field on it must not reopen an ask that was met.
    const event = parseFbmMatrixEvent(openEvent({ type: 'aid.request.fulfilled', status: 'OPEN' }));
    assert.ok(event && 'requestId' in event);
    assert.equal(buildMirroredAidPost(event, 'aidp_f').status, 'fulfilled');
});

test('a redelivered event updates the same row instead of stacking a copy', () => {
    // Webhook delivery is at-least-once, and posting somebody's need twice on
    // a public board is the failure that matters.
    const payload = openEvent();
    const opened = parseFbmMatrixEvent(payload);
    assert.ok(opened && 'requestId' in opened);

    const first = applyAidRequestEvent(opened);
    const again = applyAidRequestEvent(opened);
    assert.equal(again.id, first.id);

    const fulfilled = parseFbmMatrixEvent({
        ...payload,
        eventId: 'evt_second',
        type: 'aid.request.fulfilled',
        status: 'FULFILLED',
    });
    assert.ok(fulfilled && 'requestId' in fulfilled);
    const closed = applyAidRequestEvent(fulfilled);

    assert.equal(closed.id, first.id);
    assert.equal(closed.status, 'fulfilled');

    const matching = db
        .listCoalitionAidPosts()
        .filter((post) => post.externalId === opened.requestId);
    assert.equal(matching.length, 1);
});

test('GET /v1/coalition/mutual-aid publishes a mirrored ask on the unfiltered board', async () => {
    const event = parseFbmMatrixEvent(openEvent({ title: 'Unfiltered board ask' }));
    assert.ok(event && 'requestId' in event);
    applyAidRequestEvent(event);

    const res = await app.request('/v1/coalition/mutual-aid');
    assert.equal(res.status, 200);
    const body = (await res.json()) as { posts: Array<Record<string, unknown>> };

    const mirrored = body.posts.find((post) => post.title === 'Unfiltered board ask');
    assert.ok(mirrored, 'the mirrored ask should be on the board');
    assert.equal(mirrored.location, undefined);
    assert.equal(mirrored.locality, 'Southwest Detroit');
});

test('a radius query leaves out what it cannot place', async () => {
    // Unknown is not the same as outside. A post with no coordinates cannot
    // answer "within N km", so it is omitted rather than guessed into — or out
    // of — the result. It is still on the unfiltered board above.
    const event = parseFbmMatrixEvent(openEvent({ title: 'Unplaceable near-me ask' }));
    assert.ok(event && 'requestId' in event);
    applyAidRequestEvent(event);

    const res = await app.request('/v1/coalition/mutual-aid?lat=42.33&lng=-83.04&radiusKm=25');
    assert.equal(res.status, 200);
    const body = (await res.json()) as { posts: Array<Record<string, unknown>> };

    assert.equal(
        body.posts.some((post) => post.title === 'Unplaceable near-me ask'),
        false
    );
});

test('GET /v1/coalition/nearby does not count or crash on an unplaceable ask', async () => {
    const event = parseFbmMatrixEvent(openEvent({ title: 'Unplaceable nearby ask' }));
    assert.ok(event && 'requestId' in event);
    applyAidRequestEvent(event);

    const res = await app.request('/v1/coalition/nearby?lat=42.33&lng=-83.04&radiusKm=25');
    assert.equal(res.status, 200);
    const body = (await res.json()) as { signals: Array<{ title: string }> };

    assert.equal(
        body.signals.some((signal) => signal.title === 'Unplaceable nearby ask'),
        false
    );
});

test('the postgres descriptor round-trips a coordinate-less row', () => {
    // The memory store never touches `toRow`/`fromRow`, so the pair that
    // actually decides what reaches Postgres needs its own assertion. Both
    // halves matter: `toRow` wrote `undefined` into a NOT NULL column before
    // migration 090, and `fromRow` rebuilt `location` unconditionally — which
    // would hand every consumer a `{latitude: null, longitude: null}` object
    // that reads as located and fails `hasCoordinates` only by luck.
    const descriptor = TABLE_DESCRIPTORS.find((entry) => entry.tableName === 'coalition_aid_posts');
    assert.ok(descriptor?.toRow && descriptor.fromRow);

    const event = parseFbmMatrixEvent(openEvent({ title: 'Descriptor round-trip' }));
    assert.ok(event && 'requestId' in event);
    const post = buildMirroredAidPost(event, 'aidp_descriptor_1');

    const row = descriptor.toRow(post as unknown as Record<string, unknown>);
    assert.equal(row.latitude, null);
    assert.equal(row.longitude, null);
    assert.equal(row.locality, 'Southwest Detroit');
    assert.equal(row.source, 'freeblackmarket');
    assert.equal(row.external_id, event.requestId);

    const back = descriptor.fromRow({ ...row, created_at: '2026-09-08T12:00:00.000Z' });
    assert.equal(back.location, undefined);
    assert.equal(back.locality, 'Southwest Detroit');
    assert.equal(back.externalId, event.requestId);
});

test('the postgres descriptor still round-trips a located row', () => {
    const descriptor = TABLE_DESCRIPTORS.find((entry) => entry.tableName === 'coalition_aid_posts');
    assert.ok(descriptor?.toRow && descriptor.fromRow);

    const row = descriptor.toRow({
        id: 'aidp_local_1',
        customerId: '@local:test',
        type: 'offer',
        category: 'food',
        title: 'Local fridge restock',
        description: 'Produce available',
        location: { latitude: 42.3314, longitude: -83.0458, address: '5th & Vine' },
        displayRadiusMeters: 400,
        urgency: 'medium',
        status: 'open',
        createdAt: '2026-09-08T12:00:00.000Z',
    });
    assert.equal(row.latitude, 42.3314);
    assert.equal(row.locality, null);

    const back = descriptor.fromRow(row);
    assert.deepEqual(back.location, {
        latitude: 42.3314,
        longitude: -83.0458,
        address: '5th & Vine',
    });
    assert.equal(back.locality, undefined);
});

test('a locally-posted aid row still round-trips with its coordinates', async () => {
    // The mirror must not have cost the existing path its pin.
    const id = `aidp_local_${Math.random().toString(36).slice(2, 8)}`;
    db.createCoalitionAidPost({
        id,
        customerId: '@local:test',
        type: 'offer',
        category: 'food',
        title: 'Local fridge restock',
        description: 'Produce available',
        location: { latitude: 42.3314, longitude: -83.0458 },
        displayRadiusMeters: 400,
        urgency: 'medium',
        status: 'open',
    });

    const read = db.listCoalitionAidPosts().find((post) => post.id === id);
    assert.equal(read?.location?.latitude, 42.3314);
    assert.equal(read?.locality, undefined);
    assert.equal(read?.source, undefined);
});
