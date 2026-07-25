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
