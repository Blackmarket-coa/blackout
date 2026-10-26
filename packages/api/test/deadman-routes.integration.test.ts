import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { DeadmanSwitchRecord } from '../src/db/types';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = 'memory';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { ARMING_UNAVAILABLE, sweepOverdueDeadmanSwitches } = await import('../src/modules/deadman');
const { computeDeadlines } = await import('../src/services/deadmanScheduler');
const { db } = await import('../src/db/store');

// A default session token: what every signed-in account holds, deadman.read
// and deadman.write among it, with no capability header.
const headersFor = (userId: string, capabilityHeader?: string) => ({
    authorization: `Bearer ${signJwt(userId, userId, 600)}`,
    'content-type': 'application/json',
    ...(capabilityHeader === undefined ? {} : { 'x-blackout-capabilities': capabilityHeader }),
});

// Arming is closed (409), so the switches these tests act on are written to
// the store directly, as every switch in a deployment was while arming was
// open.
const seedSwitch = (overrides: Partial<DeadmanSwitchRecord> & { ownerId: string }) => {
    const lastCheckInAt = new Date().toISOString();
    const checkInIntervalSeconds = overrides.checkInIntervalSeconds ?? 60;
    const gracePeriodSeconds = overrides.gracePeriodSeconds ?? 60;
    const { triggerAt, releaseAt } = computeDeadlines({
        lastCheckInAt,
        checkInIntervalSeconds,
        gracePeriodSeconds,
    });
    return db.createDeadmanSwitch({
        id: randomUUID(),
        roomId: '!room:example.org',
        status: 'armed',
        checkInIntervalSeconds,
        gracePeriodSeconds,
        lastCheckInAt,
        triggerAt,
        releaseAt,
        recipients: [],
        encryptedPayload: 'sealed-payload',
        headline: 'Backup release',
        ...overrides,
    });
};

const armBody = (overrides: Record<string, unknown> = {}) => ({
    roomId: '!room:example.org',
    checkInIntervalSeconds: 3600,
    gracePeriodSeconds: 600,
    recipients: ['@witness:example.org'],
    encryptedPayload: 'sealed-payload',
    headline: 'Backup release',
    ...overrides,
});

type Envelope = { event: string; senderId: string; payload: Record<string, unknown> };
type Listed = { switches: Record<string, unknown>[] };
type FeedEvent = { type: string; payload: Record<string, unknown> };

const NOT_FOUND = { code: 'switch_not_found', message: 'Switch not found' };
const HOUR_MS = 60 * 60 * 1000;

const listAs = async (headers: Record<string, string>, scope: 'owner' | 'recipient') => {
    const res = await app.request(`/v1/deadman/switches?scope=${scope}`, { headers });
    assert.equal(res.status, 200);
    return ((await res.json()) as Listed).switches;
};

test('arming is refused with 409 arming_unavailable before the body is read, and writes nothing', async () => {
    const owner = `owner-${randomUUID()}`;
    const before = db.deadmanSwitches.size;

    // A well-formed arm, a malformed one and no JSON at all get the same answer.
    for (const body of [
        JSON.stringify(armBody()),
        JSON.stringify(armBody({ checkInIntervalSeconds: 5, recipients: [] })),
        'not json',
    ]) {
        const res = await app.request('/v1/deadman/switches', {
            method: 'POST',
            headers: headersFor(owner),
            body,
        });
        assert.equal(res.status, 409);
        assert.deepEqual(await res.json(), ARMING_UNAVAILABLE);
    }
    assert.equal(db.deadmanSwitches.size, before, 'no arm wrote a row');
    // The refusal says what the server cannot do; it promises nothing.
    assert.doesNotMatch(ARMING_UNAVAILABLE.message, /will|guarantee|deliver|sent|shipped/i);

    // The scope is still checked first: a header that drops deadman.write gets 403.
    const narrowed = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers: headersFor(owner, 'deadman.read'),
        body: JSON.stringify(armBody()),
    });
    assert.equal(narrowed.status, 403);
    assert.equal(((await narrowed.json()) as { code: string }).code, 'missing_capability');
});

test('POST /process-overdue is gone (D6)', async () => {
    const owner = `owner-${randomUUID()}`;
    const res = await app.request('/v1/deadman/process-overdue', {
        method: 'POST',
        headers: headersFor(owner),
        body: JSON.stringify({ now: new Date().toISOString() }),
    });
    assert.equal(res.status, 404);
});

test('a default session token can check in and cancel its own switch, and cancel removes the payload', async () => {
    const owner = `owner-${randomUUID()}`;
    const headers = headersFor(owner);
    const seeded = seedSwitch({ ownerId: owner, encryptedPayload: 'sealed-d4' });

    // Seeding and checking in each stamp lastCheckInAt with the current
    // millisecond; both can land in the same one. Let the clock move on first.
    const seededAt = Date.parse(seeded.lastCheckInAt);
    while (Date.now() <= seededAt) await new Promise((resolve) => setTimeout(resolve, 1));

    const checkedIn = await app.request(`/v1/deadman/switches/${seeded.id}/check-in`, {
        method: 'POST',
        headers,
    });
    assert.equal(checkedIn.status, 200);
    const checkedInBody = (await checkedIn.json()) as Envelope;
    assert.equal(checkedInBody.event, 'blackout.deadman.switch.checked_in');
    assert.equal(checkedInBody.senderId, owner);
    assert.equal(checkedInBody.payload.status, 'armed');
    assert.notEqual(checkedInBody.payload.lastCheckInAt, seeded.lastCheckInAt);
    // The owner's view carries the payload while the store holds it.
    assert.equal(checkedInBody.payload.encryptedPayload, 'sealed-d4');

    const cancelled = await app.request(`/v1/deadman/switches/${seeded.id}/cancel`, {
        method: 'POST',
        headers,
    });
    assert.equal(cancelled.status, 200);
    const cancelledBody = (await cancelled.json()) as Envelope;
    assert.equal(cancelledBody.event, 'blackout.deadman.switch.cancelled');
    assert.equal(cancelledBody.payload.status, 'cancelled');
    // The payload went with the cancel, so the owner's envelope no longer
    // carries it (the D3 test used to assert that it did).
    assert.equal(cancelledBody.payload.encryptedPayload, undefined);
    assert.ok(!JSON.stringify(cancelledBody).includes('sealed-d4'));
    assert.equal(db.getDeadmanSwitch(seeded.id)?.encryptedPayload, '');
    assert.equal(db.getDeadmanSwitch(seeded.id)?.status, 'cancelled');

    // The owner's list still shows the switch and what became of it, without
    // the payload; the label is theirs and stays.
    const entry = (await listAs(headers, 'owner')).find((e) => e.switchId === seeded.id);
    assert.equal(entry?.status, 'cancelled');
    assert.equal(entry?.encryptedPayload, undefined);
    assert.equal(entry?.headline, 'Backup release');

    // A cancelled switch cannot be checked in.
    const late = await app.request(`/v1/deadman/switches/${seeded.id}/check-in`, {
        method: 'POST',
        headers,
    });
    assert.equal(late.status, 409);
    assert.equal(((await late.json()) as { code: string }).code, 'switch_cancelled');
});

test('a second cancel removes the text a switch cancelled earlier still holds', async () => {
    const owner = `owner-${randomUUID()}`;
    const headers = headersFor(owner);
    // Cancelled before cancel cleared payloads.
    const seeded = seedSwitch({
        ownerId: owner,
        status: 'cancelled',
        encryptedPayload: 'sealed-legacy',
    });

    const before = await app.request(`/v1/deadman/switches/${seeded.id}`, { headers });
    assert.equal(before.status, 200);
    assert.equal(
        ((await before.json()) as { encryptedPayload?: string }).encryptedPayload,
        'sealed-legacy'
    );

    const cancel = await app.request(`/v1/deadman/switches/${seeded.id}/cancel`, {
        method: 'POST',
        headers,
    });
    assert.equal(cancel.status, 200);
    const body = (await cancel.json()) as Envelope;
    assert.equal(body.event, 'blackout.deadman.switch.cancelled');
    assert.equal(body.payload.status, 'cancelled');
    assert.equal(body.payload.encryptedPayload, undefined);
    assert.equal(db.getDeadmanSwitch(seeded.id)?.encryptedPayload, '');

    const after = await app.request(`/v1/deadman/switches/${seeded.id}`, { headers });
    assert.equal(
        ((await after.json()) as { encryptedPayload?: string }).encryptedPayload,
        undefined
    );

    // Idempotent.
    const again = await app.request(`/v1/deadman/switches/${seeded.id}/cancel`, {
        method: 'POST',
        headers,
    });
    assert.equal(again.status, 200);
    assert.equal(db.getDeadmanSwitch(seeded.id)?.encryptedPayload, '');
});

test('anyone but the owner gets the same 404, whether the switch exists or not', async () => {
    const owner = `owner-${randomUUID()}`;
    const recipient = `recipient-${randomUUID()}`;
    const stranger = `stranger-${randomUUID()}`;
    const seeded = seedSwitch({ ownerId: owner, recipients: [recipient] });
    const unknown = randomUUID();

    for (const [who, caller] of [
        ['a recipient', recipient],
        ['a stranger', stranger],
    ] as const) {
        for (const [which, id] of [
            ['an existing', seeded.id],
            ['an unknown', unknown],
        ] as const) {
            for (const action of ['check-in', 'cancel']) {
                const res = await app.request(`/v1/deadman/switches/${id}/${action}`, {
                    method: 'POST',
                    headers: headersFor(caller),
                });
                assert.equal(res.status, 404, `${action} by ${who} on ${which} switch`);
                assert.deepEqual(await res.json(), NOT_FOUND);
            }
            const read = await app.request(`/v1/deadman/switches/${id}`, {
                headers: headersFor(caller),
            });
            assert.equal(read.status, 404, `read by ${who} of ${which} switch`);
            assert.deepEqual(await read.json(), NOT_FOUND);
        }
    }

    // The owner gets that same body for an id that names nothing.
    const ownerUnknown = await app.request(`/v1/deadman/switches/${unknown}`, {
        headers: headersFor(owner),
    });
    assert.equal(ownerUnknown.status, 404);
    assert.deepEqual(await ownerUnknown.json(), NOT_FOUND);

    // And nothing moved.
    assert.equal(db.getDeadmanSwitch(seeded.id)?.status, 'armed');
    assert.equal(db.getDeadmanSwitch(seeded.id)?.encryptedPayload, 'sealed-payload');
});

test('a recipient sees nothing before the trigger, and after it only the released view', async () => {
    const stamp = randomUUID();
    const owner = `owner-${stamp}`;
    const recipient = `recipient-${stamp}`;
    const ownerHeaders = headersFor(owner);
    const recipientHeaders = headersFor(recipient);
    const roomId = `!private-${stamp}:example.org`;
    const seeded = seedSwitch({
        ownerId: owner,
        roomId,
        recipients: [recipient],
        encryptedPayload: `sealed-${stamp}`,
        headline: `label-${stamp}`,
    });
    const readAsRecipient = () =>
        app.request(`/v1/deadman/switches/${seeded.id}`, { headers: recipientHeaders });
    const recipientListText = async () =>
        (
            await app.request('/v1/deadman/switches?scope=recipient', {
                headers: recipientHeaders,
            })
        ).text();
    const nothingForTheRecipient = async (when: string) => {
        assert.equal((await readAsRecipient()).status, 404, `${when}: the single read`);
        const text = await recipientListText();
        for (const secret of [seeded.id, owner, roomId, `label-${stamp}`, `sealed-${stamp}`]) {
            assert.ok(!text.includes(secret), `${when}: the list must not carry ${secret}`);
        }
    };

    // Armed, then in grace: the recipient is answered like a stranger.
    await nothingForTheRecipient('armed');
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 65 * 1000));
    assert.equal(db.getDeadmanSwitch(seeded.id)?.status, 'grace');
    await nothingForTheRecipient('in grace');

    // Triggered: the released view, and nothing more.
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 200 * 1000));
    const expected = {
        switchId: seeded.id,
        ownerId: owner,
        status: 'triggered',
        releaseAt: db.getDeadmanSwitch(seeded.id)!.releaseAt,
        encryptedPayload: `sealed-${stamp}`,
    };
    const listed = (await listAs(recipientHeaders, 'recipient')).find(
        (entry) => entry.switchId === seeded.id
    );
    assert.deepEqual(listed, expected);
    const single = await readAsRecipient();
    assert.equal(single.status, 200);
    assert.deepEqual(await single.json(), expected);

    // The owner reads the full view, and does not appear in their own
    // recipient-scope listing.
    const ownerRead = await app.request(`/v1/deadman/switches/${seeded.id}`, {
        headers: ownerHeaders,
    });
    assert.equal(ownerRead.status, 200);
    const ownerView = (await ownerRead.json()) as Record<string, unknown>;
    assert.equal(ownerView.status, 'triggered');
    assert.deepEqual(ownerView.recipients, [recipient]);
    assert.equal(ownerView.headline, `label-${stamp}`);
    assert.equal(ownerView.roomId, roomId);
    assert.ok(typeof ownerView.lastCheckInAt === 'string');
    assert.ok(
        !(await listAs(ownerHeaders, 'recipient')).some((entry) => entry.ownerId === owner),
        'owner should not appear in their own recipient-scope listing'
    );
});

test('a cancelled switch never reaches its recipient, however long after (D3)', async () => {
    const stamp = randomUUID();
    const owner = `owner-${stamp}`;
    const recipient = `recipient-${stamp}`;
    const seeded = seedSwitch({
        ownerId: owner,
        recipients: [recipient],
        encryptedPayload: `sealed-cancelled-${stamp}`,
    });

    const cancel = await app.request(`/v1/deadman/switches/${seeded.id}/cancel`, {
        method: 'POST',
        headers: headersFor(owner),
    });
    assert.equal(cancel.status, 200);

    sweepOverdueDeadmanSwitches(new Date(Date.now() + 30 * 24 * HOUR_MS));
    assert.equal(db.getDeadmanSwitch(seeded.id)?.status, 'cancelled');
    const read = await app.request(`/v1/deadman/switches/${seeded.id}`, {
        headers: headersFor(recipient),
    });
    assert.equal(read.status, 404);
    const list = await app.request('/v1/deadman/switches?scope=recipient', {
        headers: headersFor(recipient),
    });
    const text = await list.text();
    assert.ok(!text.includes(seeded.id));
    assert.ok(!text.includes(`sealed-cancelled-${stamp}`));
});

test('a triggered switch cannot be checked in or cancelled, and the refusal claims nothing was sent (D2)', async () => {
    const owner = `owner-${randomUUID()}`;
    const headers = headersFor(owner);
    const seeded = seedSwitch({ ownerId: owner, encryptedPayload: 'sealed-fired' });
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 65 * 1000));
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 200 * 1000));
    assert.equal(db.getDeadmanSwitch(seeded.id)?.status, 'triggered');

    const checkIn = await app.request(`/v1/deadman/switches/${seeded.id}/check-in`, {
        method: 'POST',
        headers,
    });
    assert.equal(checkIn.status, 409);
    // Triggering only changes the status; the server sends nothing to anyone,
    // so the refusal must not claim that anything went out.
    const refusal = (await checkIn.json()) as { code: string; message: string };
    assert.equal(refusal.code, 'switch_triggered');
    assert.equal(refusal.message, 'Switch already triggered');
    assert.doesNotMatch(refusal.message, /ship|publish|deliver|release|sent/i);

    const cancel = await app.request(`/v1/deadman/switches/${seeded.id}/cancel`, {
        method: 'POST',
        headers,
    });
    assert.equal(cancel.status, 409);
    const cancelRefusal = (await cancel.json()) as { code: string; message: string };
    assert.equal(cancelRefusal.code, 'switch_triggered');
    assert.doesNotMatch(cancelRefusal.message, /ship|publish|deliver|release|sent/i);
    // A release is not taken back: the payload is still there for the people named.
    assert.equal(db.getDeadmanSwitch(seeded.id)?.encryptedPayload, 'sealed-fired');
});

test('autonomous sweep fires an overdue switch without the owner present', async () => {
    const owner = `owner-${randomUUID()}`;
    const headers = headersFor(owner);
    const seeded = seedSwitch({ ownerId: owner });

    const statusOf = async (): Promise<string> => {
        const res = await app.request(`/v1/deadman/switches/${seeded.id}`, { headers });
        assert.equal(res.status, 200);
        return ((await res.json()) as { status: string }).status;
    };

    // The server-side sweep (the background loop's engine), not any
    // owner-authenticated request, drives the transition: a dead-man's switch
    // must fire when the owner is gone.
    assert.equal(await statusOf(), 'armed');

    const graced = sweepOverdueDeadmanSwitches(new Date(Date.now() + 65 * 1000));
    assert.ok(graced >= 1, 'sweep should advance the overdue switch into grace');
    assert.equal(await statusOf(), 'grace');

    const triggered = sweepOverdueDeadmanSwitches(new Date(Date.now() + 200 * 1000));
    assert.ok(triggered >= 1, 'sweep should advance the switch into triggered');
    assert.equal(await statusOf(), 'triggered');

    // Idempotent: a further sweep does not re-fire an already-triggered switch.
    const again = sweepOverdueDeadmanSwitches(new Date(Date.now() + 400 * 1000));
    assert.ok(!Number.isNaN(again));
    assert.equal(await statusOf(), 'triggered');
});

test('the event feed shows each caller only the events of switches they own', async () => {
    const stamp = randomUUID();
    const owner = `owner-${stamp}`;
    const recipient = `recipient-${stamp}`;
    const stranger = `stranger-${stamp}`;
    const roomId = `!private-${stamp}:example.org`;
    const seeded = seedSwitch({ ownerId: owner, roomId, recipients: [recipient] });

    // The background sweep drives it to grace, then triggered: those are the
    // events that also carry the recipient list.
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 65 * 1000));
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 200 * 1000));

    for (const [who, outsider] of [
        ['a stranger', stranger],
        ['a recipient', recipient],
    ] as const) {
        const feed = await app.request('/v1/deadman/events', { headers: headersFor(outsider) });
        assert.equal(feed.status, 200);
        const text = await feed.text();
        for (const secret of [seeded.id, owner, roomId, recipient]) {
            assert.ok(!text.includes(secret), `${who} must not see ${secret} in the feed`);
        }
    }

    const ownerFeed = await app.request('/v1/deadman/events', { headers: headersFor(owner) });
    assert.equal(ownerFeed.status, 200);
    const ownerEvents = (await ownerFeed.json()) as FeedEvent[];
    assert.deepEqual(
        ownerEvents.filter((event) => event.payload.switchId === seeded.id).map((e) => e.type),
        ['deadman.switch.grace', 'deadman.switch.triggered']
    );
    assert.ok(ownerEvents.every((event) => event.payload.ownerId === owner));
});

test('a switch the sweep reaches hours late gets one 72-hour grace window, and its recipient reads nothing until it ends', async () => {
    const stamp = randomUUID();
    const owner = `owner-${stamp}`;
    const recipient = `recipient-${stamp}`;
    const seeded = seedSwitch({
        ownerId: owner,
        recipients: [recipient],
        encryptedPayload: `sealed-backlog-${stamp}`,
    });
    const readAsRecipient = () =>
        app.request(`/v1/deadman/switches/${seeded.id}`, { headers: headersFor(recipient) });

    // The sweep comes back two hours after the release: nobody was watching.
    const back = new Date(Date.now() + 2 * HOUR_MS);
    sweepOverdueDeadmanSwitches(back);
    const inWindow = db.getDeadmanSwitch(seeded.id)!;
    assert.equal(inWindow.status, 'grace', 'not fired on the first sweep back');
    assert.equal(inWindow.releaseAt, new Date(back.getTime() + 72 * HOUR_MS).toISOString());
    assert.equal(inWindow.backlogGraceStartedAt, back.toISOString());
    assert.equal((await readAsRecipient()).status, 404, 'nothing for the recipient in the window');

    // Sweeps inside the window leave it alone.
    sweepOverdueDeadmanSwitches(new Date(back.getTime() + 71 * HOUR_MS));
    assert.equal(db.getDeadmanSwitch(seeded.id)?.status, 'grace');
    assert.equal((await readAsRecipient()).status, 404);

    // When the window ends it fires, and the recipient can read the payload.
    sweepOverdueDeadmanSwitches(new Date(back.getTime() + 72 * HOUR_MS + 1000));
    const fired = await readAsRecipient();
    assert.equal(fired.status, 200);
    const released = (await fired.json()) as { status: string; encryptedPayload?: string };
    assert.equal(released.status, 'triggered');
    assert.equal(released.encryptedPayload, `sealed-backlog-${stamp}`);

    // The owner's feed records the window as a grace event that says so.
    const feed = await app.request('/v1/deadman/events', { headers: headersFor(owner) });
    const events = ((await feed.json()) as FeedEvent[]).filter(
        (event) => event.payload.switchId === seeded.id
    );
    assert.deepEqual(
        events.map((event) => event.type),
        ['deadman.switch.grace', 'deadman.switch.triggered']
    );
    assert.equal(events[0].payload.backlogWindow, true);
});

test('a check-in ends the backlog window, so the next missed check-in gets its own', async () => {
    const owner = `owner-${randomUUID()}`;
    const seeded = seedSwitch({ ownerId: owner });

    sweepOverdueDeadmanSwitches(new Date(Date.now() + 2 * HOUR_MS));
    assert.equal(db.getDeadmanSwitch(seeded.id)?.status, 'grace');
    assert.ok(db.getDeadmanSwitch(seeded.id)?.backlogGraceStartedAt);

    const checkedIn = await app.request(`/v1/deadman/switches/${seeded.id}/check-in`, {
        method: 'POST',
        headers: headersFor(owner),
    });
    assert.equal(checkedIn.status, 200);
    const afterCheckIn = db.getDeadmanSwitch(seeded.id);
    assert.equal(afterCheckIn?.status, 'armed');
    assert.equal(afterCheckIn?.backlogGraceStartedAt, undefined);

    // A second outage: the switch gets a window again rather than firing.
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 3 * HOUR_MS));
    assert.equal(db.getDeadmanSwitch(seeded.id)?.status, 'grace');
    assert.ok(db.getDeadmanSwitch(seeded.id)?.backlogGraceStartedAt);
});
