import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = 'memory';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { sweepOverdueDeadmanSwitches } = await import('../src/modules/deadman');
const { db } = await import('../src/db/store');

function headersFor(userId: string, capabilities: string[] = ['deadman.read', 'deadman.write']) {
    return {
        authorization: `Bearer ${signJwt(userId, userId, 600)}`,
        'content-type': 'application/json',
        'x-blackout-capabilities': capabilities.join(','),
    };
}

const armBody = (overrides: Record<string, unknown> = {}) => ({
    roomId: '!room:example.org',
    checkInIntervalSeconds: 3600,
    gracePeriodSeconds: 600,
    recipients: ['@witness:example.org'],
    encryptedPayload: 'sealed-payload',
    headline: 'Backup release',
    ...overrides,
});

test('deadman.write capability is required to arm a switch', async () => {
    const response = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers: headersFor('owner-readonly', ['deadman.read']),
        body: JSON.stringify(armBody()),
    });
    assert.equal(response.status, 403);
});

test('arming, checking in, and cancelling a switch produces protocol envelopes', async () => {
    const owner = `owner-${Date.now()}`;
    const headers = headersFor(owner);

    const armed = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers,
        body: JSON.stringify(armBody()),
    });
    assert.equal(armed.status, 201);
    const armedBody = (await armed.json()) as Record<string, unknown>;
    assert.equal(armedBody.event, 'blackout.deadman.switch.armed');
    assert.equal(armedBody.senderId, owner);
    const armedPayload = armedBody.payload as Record<string, unknown>;
    assert.equal(armedPayload.ownerId, owner);
    assert.equal(armedPayload.status, 'armed');
    assert.equal(armedPayload.roomId, '!room:example.org');
    const switchId = armedPayload.switchId as string;
    assert.ok(switchId);

    const checkedIn = await app.request(`/v1/deadman/switches/${switchId}/check-in`, {
        method: 'POST',
        headers,
    });
    assert.equal(checkedIn.status, 200);
    const checkedInBody = (await checkedIn.json()) as Record<string, unknown>;
    assert.equal(checkedInBody.event, 'blackout.deadman.switch.checked_in');
    const checkedInPayload = checkedInBody.payload as Record<string, unknown>;
    assert.equal(checkedInPayload.status, 'armed');
    assert.notEqual(checkedInPayload.lastCheckInAt, armedPayload.lastCheckInAt);

    const cancelled = await app.request(`/v1/deadman/switches/${switchId}/cancel`, {
        method: 'POST',
        headers,
    });
    assert.equal(cancelled.status, 200);
    const cancelledBody = (await cancelled.json()) as Record<string, unknown>;
    assert.equal(cancelledBody.event, 'blackout.deadman.switch.cancelled');
    assert.equal((cancelledBody.payload as Record<string, unknown>).status, 'cancelled');
});

test('only the owner can check in or cancel a switch', async () => {
    const owner = `owner-${Date.now()}-a`;
    const intruder = `owner-${Date.now()}-b`;
    const ownerHeaders = headersFor(owner);
    const intruderHeaders = headersFor(intruder);

    const armed = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify(armBody()),
    });
    assert.equal(armed.status, 201);
    const switchId = ((await armed.json()) as { payload: { switchId: string } }).payload.switchId;

    const stolenCheckIn = await app.request(`/v1/deadman/switches/${switchId}/check-in`, {
        method: 'POST',
        headers: intruderHeaders,
    });
    assert.equal(stolenCheckIn.status, 403);

    const stolenCancel = await app.request(`/v1/deadman/switches/${switchId}/cancel`, {
        method: 'POST',
        headers: intruderHeaders,
    });
    assert.equal(stolenCancel.status, 403);
});

test('process-overdue advances grace and triggered transitions', async () => {
    const owner = `owner-${Date.now()}-overdue`;
    const headers = headersFor(owner);

    const armed = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers,
        body: JSON.stringify(armBody({ checkInIntervalSeconds: 60, gracePeriodSeconds: 60 })),
    });
    assert.equal(armed.status, 201);
    const switchId = ((await armed.json()) as { payload: { switchId: string } }).payload.switchId;

    const futurePastTrigger = new Date(Date.now() + 65 * 1000).toISOString();
    const intoGrace = await app.request('/v1/deadman/process-overdue', {
        method: 'POST',
        headers,
        body: JSON.stringify({ now: futurePastTrigger }),
    });
    assert.equal(intoGrace.status, 200);
    const intoGraceBody = (await intoGrace.json()) as {
        processed: { switchId: string; status: string }[];
    };
    const graceEntry = intoGraceBody.processed.find((entry) => entry.switchId === switchId);
    assert.ok(graceEntry, 'expected switch to appear in grace transitions');
    assert.equal(graceEntry?.status, 'grace');

    const futurePastRelease = new Date(Date.now() + 200 * 1000).toISOString();
    const triggered = await app.request('/v1/deadman/process-overdue', {
        method: 'POST',
        headers,
        body: JSON.stringify({ now: futurePastRelease }),
    });
    assert.equal(triggered.status, 200);
    const triggeredBody = (await triggered.json()) as {
        processed: { switchId: string; status: string }[];
    };
    const triggeredEntry = triggeredBody.processed.find((entry) => entry.switchId === switchId);
    assert.ok(triggeredEntry, 'expected switch to appear in triggered transitions');
    assert.equal(triggeredEntry?.status, 'triggered');

    const afterTrigger = await app.request(`/v1/deadman/switches/${switchId}/check-in`, {
        method: 'POST',
        headers,
    });
    assert.equal(afterTrigger.status, 409);
    // Triggering only changes the status; the server sends nothing to anyone,
    // so the refusal must not claim that anything went out.
    const refusal = (await afterTrigger.json()) as { code: string; message: string };
    assert.equal(refusal.code, 'switch_triggered');
    assert.equal(refusal.message, 'Switch already triggered');
    assert.doesNotMatch(refusal.message, /ship|publish|deliver|release|sent/i);
});

test('switches list scopes results by owner vs recipient', async () => {
    const owner = `owner-${Date.now()}-list`;
    const recipient = `recipient-${Date.now()}-list`;
    const ownerHeaders = headersFor(owner);
    const recipientHeaders = headersFor(recipient);

    const armed = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify(armBody({ recipients: [recipient] })),
    });
    assert.equal(armed.status, 201);

    const ownerList = (await (
        await app.request('/v1/deadman/switches?scope=owner', { headers: ownerHeaders })
    ).json()) as { switches: { ownerId: string }[] };
    assert.ok(ownerList.switches.some((entry) => entry.ownerId === owner));

    const recipientList = (await (
        await app.request('/v1/deadman/switches?scope=recipient', {
            headers: recipientHeaders,
        })
    ).json()) as { switches: { recipients: string[] }[] };
    assert.ok(recipientList.switches.some((entry) => entry.recipients.includes(recipient)));

    const ownerSeesRecipientScope = (await (
        await app.request('/v1/deadman/switches?scope=recipient', {
            headers: ownerHeaders,
        })
    ).json()) as { switches: { ownerId: string }[] };
    assert.ok(
        !ownerSeesRecipientScope.switches.some((entry) => entry.ownerId === owner),
        'owner should not appear in their own recipient-scope listing'
    );
});

test('arm rejects malformed input', async () => {
    const owner = `owner-${Date.now()}-bad`;
    const headers = headersFor(owner);

    const tooShort = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers,
        body: JSON.stringify(armBody({ checkInIntervalSeconds: 5 })),
    });
    assert.equal(tooShort.status, 400);

    const noRecipients = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers,
        body: JSON.stringify(armBody({ recipients: [] })),
    });
    assert.equal(noRecipients.status, 400);
});

test('autonomous sweep fires an overdue switch without the owner present', async () => {
    const owner = `owner-${Date.now()}-sweep`;
    const headers = headersFor(owner);

    const armed = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers,
        body: JSON.stringify(armBody({ checkInIntervalSeconds: 60, gracePeriodSeconds: 60 })),
    });
    assert.equal(armed.status, 201);
    const switchId = ((await armed.json()) as { payload: { switchId: string } }).payload.switchId;

    const statusOf = async (): Promise<string> => {
        const res = await app.request(`/v1/deadman/switches/${switchId}`, { headers });
        assert.equal(res.status, 200);
        return ((await res.json()) as { status: string }).status;
    };

    // The server-side sweep (the background loop's engine) — NOT any
    // owner-authenticated request — drives the transition. This is the core of
    // the fix: a dead-man's switch must fire when the owner is gone.
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

// A default session token: what every signed-in account holds (deadman.read),
// with no capability header.
const defaultTokenHeaders = (userId: string) => ({
    authorization: `Bearer ${signJwt(userId, userId, 600)}`,
});

type FeedEvent = { type: string; payload: Record<string, unknown> };

test('the event feed shows each caller only the events of switches they own', async () => {
    const stamp = `${Date.now()}-feed`;
    const owner = `owner-${stamp}`;
    const recipient = `recipient-${stamp}`;
    const stranger = `stranger-${stamp}`;
    const roomId = `!private-${stamp}:example.org`;
    const ownerHeaders = headersFor(owner);

    const armed = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify(
            armBody({
                roomId,
                recipients: [recipient],
                checkInIntervalSeconds: 60,
                gracePeriodSeconds: 60,
            })
        ),
    });
    assert.equal(armed.status, 201);
    const switchId = ((await armed.json()) as { payload: { switchId: string } }).payload.switchId;

    // The background sweep drives it to grace, then triggered: those are the
    // events that also carry the recipient list.
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 65 * 1000));
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 200 * 1000));

    for (const outsider of [stranger, recipient]) {
        const feed = await app.request('/v1/deadman/events', {
            headers: defaultTokenHeaders(outsider),
        });
        assert.equal(feed.status, 200);
        const text = await feed.text();
        for (const secret of [switchId, owner, roomId, recipient]) {
            assert.ok(
                !text.includes(secret),
                `${
                    outsider === stranger ? 'a stranger' : 'a recipient'
                } must not see ${secret} in the feed`
            );
        }
    }

    const ownerFeed = await app.request('/v1/deadman/events', {
        headers: defaultTokenHeaders(owner),
    });
    assert.equal(ownerFeed.status, 200);
    const ownerEvents = (await ownerFeed.json()) as FeedEvent[];
    assert.deepEqual(
        ownerEvents.filter((event) => event.payload.switchId === switchId).map((e) => e.type),
        ['deadman.switch.armed', 'deadman.switch.grace', 'deadman.switch.triggered']
    );
    assert.ok(ownerEvents.every((event) => event.payload.ownerId === owner));
});

test('a recipient gets the encrypted payload only after the switch triggers, never after a cancel', async () => {
    const stamp = `${Date.now()}-release`;
    const owner = `owner-${stamp}`;
    const recipient = `recipient-${stamp}`;
    const ownerHeaders = headersFor(owner);
    const recipientHeaders = defaultTokenHeaders(recipient);

    const readAs = async (headers: Record<string, string>, switchId: string) => {
        const single = await app.request(`/v1/deadman/switches/${switchId}`, { headers });
        assert.equal(single.status, 200);
        return (await single.json()) as { status: string; encryptedPayload?: string };
    };
    const recipientListEntry = async (switchId: string) => {
        const list = await app.request('/v1/deadman/switches?scope=recipient', {
            headers: recipientHeaders,
        });
        assert.equal(list.status, 200);
        const body = (await list.json()) as {
            switches: { switchId: string; encryptedPayload?: string }[];
        };
        const entry = body.switches.find((candidate) => candidate.switchId === switchId);
        assert.ok(entry, 'the recipient should see the switch in their recipient list');
        return entry;
    };

    const armed = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify(
            armBody({
                recipients: [recipient],
                checkInIntervalSeconds: 60,
                gracePeriodSeconds: 60,
                encryptedPayload: `sealed-fires-${stamp}`,
            })
        ),
    });
    assert.equal(armed.status, 201);
    const fires = ((await armed.json()) as { payload: { switchId: string } }).payload.switchId;

    // Armed: the recipient sees the switch but not its payload; the owner does.
    assert.equal((await readAs(recipientHeaders, fires)).encryptedPayload, undefined);
    assert.equal((await recipientListEntry(fires)).encryptedPayload, undefined);
    assert.equal((await readAs(ownerHeaders, fires)).encryptedPayload, `sealed-fires-${stamp}`);

    // Grace window: still nothing for the recipient.
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 65 * 1000));
    const inGrace = await readAs(recipientHeaders, fires);
    assert.equal(inGrace.status, 'grace');
    assert.equal(inGrace.encryptedPayload, undefined);
    assert.equal((await recipientListEntry(fires)).encryptedPayload, undefined);

    // Triggered: now the recipient can read it, in both views.
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 200 * 1000));
    const released = await readAs(recipientHeaders, fires);
    assert.equal(released.status, 'triggered');
    assert.equal(released.encryptedPayload, `sealed-fires-${stamp}`);
    assert.equal((await recipientListEntry(fires)).encryptedPayload, `sealed-fires-${stamp}`);

    // A cancelled switch never releases its payload to a recipient.
    const second = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify(
            armBody({ recipients: [recipient], encryptedPayload: `sealed-cancelled-${stamp}` })
        ),
    });
    assert.equal(second.status, 201);
    const cancelledId = ((await second.json()) as { payload: { switchId: string } }).payload
        .switchId;
    assert.equal((await readAs(recipientHeaders, cancelledId)).encryptedPayload, undefined);

    const cancel = await app.request(`/v1/deadman/switches/${cancelledId}/cancel`, {
        method: 'POST',
        headers: ownerHeaders,
    });
    assert.equal(cancel.status, 200);
    // The owner's own envelope is unchanged and still carries the payload.
    const cancelEnvelope = (await cancel.json()) as { payload: { encryptedPayload?: string } };
    assert.equal(cancelEnvelope.payload.encryptedPayload, `sealed-cancelled-${stamp}`);

    sweepOverdueDeadmanSwitches(new Date(Date.now() + 30 * 24 * 3600 * 1000));
    const afterCancel = await readAs(recipientHeaders, cancelledId);
    assert.equal(afterCancel.status, 'cancelled');
    assert.equal(afterCancel.encryptedPayload, undefined);
    assert.equal((await recipientListEntry(cancelledId)).encryptedPayload, undefined);
    const recipientList = await app.request('/v1/deadman/switches?scope=recipient', {
        headers: recipientHeaders,
    });
    assert.ok(!(await recipientList.text()).includes(`sealed-cancelled-${stamp}`));
});

const HOUR_MS = 60 * 60 * 1000;

test('a switch the sweep reaches hours late gets one 72-hour grace window, and its recipient reads nothing until it ends', async () => {
    const stamp = `${Date.now()}-backlog`;
    const owner = `owner-${stamp}`;
    const recipient = `recipient-${stamp}`;
    const ownerHeaders = headersFor(owner);
    const armed = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify(
            armBody({
                recipients: [recipient],
                checkInIntervalSeconds: 60,
                gracePeriodSeconds: 60,
                encryptedPayload: `sealed-backlog-${stamp}`,
            })
        ),
    });
    assert.equal(armed.status, 201);
    const switchId = ((await armed.json()) as { payload: { switchId: string } }).payload.switchId;
    const readAsRecipient = async () => {
        const res = await app.request(`/v1/deadman/switches/${switchId}`, {
            headers: defaultTokenHeaders(recipient),
        });
        assert.equal(res.status, 200);
        return (await res.json()) as {
            status: string;
            releaseAt: string;
            encryptedPayload?: string;
        };
    };

    // The sweep comes back two hours after the release: nobody was watching.
    const back = new Date(Date.now() + 2 * HOUR_MS);
    sweepOverdueDeadmanSwitches(back);
    const inWindow = await readAsRecipient();
    assert.equal(inWindow.status, 'grace', 'not fired on the first sweep back');
    assert.equal(inWindow.encryptedPayload, undefined);
    assert.equal(inWindow.releaseAt, new Date(back.getTime() + 72 * HOUR_MS).toISOString());
    assert.equal(db.getDeadmanSwitch(switchId)?.backlogGraceStartedAt, back.toISOString());

    // Sweeps inside the window leave it alone.
    sweepOverdueDeadmanSwitches(new Date(back.getTime() + 71 * HOUR_MS));
    assert.equal((await readAsRecipient()).status, 'grace');

    // When the window ends it fires, and the recipient can read the payload.
    sweepOverdueDeadmanSwitches(new Date(back.getTime() + 72 * HOUR_MS + 1000));
    const fired = await readAsRecipient();
    assert.equal(fired.status, 'triggered');
    assert.equal(fired.encryptedPayload, `sealed-backlog-${stamp}`);

    // The owner's feed records the window as a grace event that says so.
    const feed = await app.request('/v1/deadman/events', { headers: defaultTokenHeaders(owner) });
    const events = ((await feed.json()) as FeedEvent[]).filter(
        (event) => event.payload.switchId === switchId
    );
    assert.deepEqual(
        events.map((event) => event.type),
        ['deadman.switch.armed', 'deadman.switch.grace', 'deadman.switch.triggered']
    );
    assert.equal(events[1].payload.backlogWindow, true);
});

test('a check-in ends the backlog window, so the next missed check-in gets its own', async () => {
    const owner = `owner-${Date.now()}-backlog-checkin`;
    const ownerHeaders = headersFor(owner);
    const armed = await app.request('/v1/deadman/switches', {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify(armBody({ checkInIntervalSeconds: 60, gracePeriodSeconds: 60 })),
    });
    assert.equal(armed.status, 201);
    const switchId = ((await armed.json()) as { payload: { switchId: string } }).payload.switchId;

    sweepOverdueDeadmanSwitches(new Date(Date.now() + 2 * HOUR_MS));
    assert.equal(db.getDeadmanSwitch(switchId)?.status, 'grace');
    assert.ok(db.getDeadmanSwitch(switchId)?.backlogGraceStartedAt);

    const checkedIn = await app.request(`/v1/deadman/switches/${switchId}/check-in`, {
        method: 'POST',
        headers: ownerHeaders,
    });
    assert.equal(checkedIn.status, 200);
    const afterCheckIn = db.getDeadmanSwitch(switchId);
    assert.equal(afterCheckIn?.status, 'armed');
    assert.equal(afterCheckIn?.backlogGraceStartedAt, undefined);

    // A second outage: the switch gets a window again rather than firing.
    sweepOverdueDeadmanSwitches(new Date(Date.now() + 3 * HOUR_MS));
    assert.equal(db.getDeadmanSwitch(switchId)?.status, 'grace');
    assert.ok(db.getDeadmanSwitch(switchId)?.backlogGraceStartedAt);
});
