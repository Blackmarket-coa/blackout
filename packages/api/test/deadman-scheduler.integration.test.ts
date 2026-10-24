import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEADMAN_BACKLOG_GRACE_SECONDS,
    applyCheckIn,
    computeDeadlines,
    evaluateSweepTransition,
    evaluateTransition,
    validateArmInput,
} from '../src/services/deadmanScheduler';
import type { DeadmanSwitchRecord } from '../src/db/types';

const baseRecord = (overrides: Partial<DeadmanSwitchRecord> = {}): DeadmanSwitchRecord => {
    const lastCheckInAt = '2026-01-01T00:00:00.000Z';
    const checkInIntervalSeconds = 3600;
    const gracePeriodSeconds = 600;
    const { triggerAt, releaseAt } = computeDeadlines({
        lastCheckInAt,
        checkInIntervalSeconds,
        gracePeriodSeconds,
    });
    return {
        id: 'switch-1',
        ownerId: 'user-1',
        roomId: '!room:example.org',
        status: 'armed',
        checkInIntervalSeconds,
        gracePeriodSeconds,
        lastCheckInAt,
        triggerAt,
        releaseAt,
        recipients: ['recipient-1'],
        encryptedPayload: 'payload',
        createdAt: lastCheckInAt,
        updatedAt: lastCheckInAt,
        ...overrides,
    };
};

test('computeDeadlines stacks grace period after the check-in interval', () => {
    const { triggerAt, releaseAt } = computeDeadlines({
        lastCheckInAt: '2026-01-01T00:00:00.000Z',
        checkInIntervalSeconds: 3600,
        gracePeriodSeconds: 600,
    });
    assert.equal(triggerAt, '2026-01-01T01:00:00.000Z');
    assert.equal(releaseAt, '2026-01-01T01:10:00.000Z');
});

test('evaluateTransition keeps armed switches that are still within the interval', () => {
    const record = baseRecord();
    const transition = evaluateTransition(record, new Date('2026-01-01T00:30:00.000Z'));
    assert.equal(transition.kind, 'none');
    assert.equal(transition.record.status, 'armed');
});

test('evaluateTransition moves armed -> grace when the trigger deadline elapses', () => {
    const record = baseRecord();
    const transition = evaluateTransition(record, new Date('2026-01-01T01:05:00.000Z'));
    assert.equal(transition.kind, 'grace');
    assert.equal(transition.record.status, 'grace');
});

test('evaluateTransition moves grace -> triggered when the release deadline elapses', () => {
    const record = baseRecord({ status: 'grace' });
    const transition = evaluateTransition(record, new Date('2026-01-01T01:11:00.000Z'));
    assert.equal(transition.kind, 'triggered');
    assert.equal(transition.record.status, 'triggered');
});

test('evaluateTransition skips grace when gracePeriodSeconds is zero', () => {
    const record = baseRecord({
        gracePeriodSeconds: 0,
        releaseAt: '2026-01-01T01:00:00.000Z',
    });
    const transition = evaluateTransition(record, new Date('2026-01-01T01:00:01.000Z'));
    assert.equal(transition.kind, 'triggered');
});

test('evaluateTransition treats triggered/cancelled as terminal', () => {
    for (const status of ['triggered', 'cancelled'] as const) {
        const record = baseRecord({ status });
        const transition = evaluateTransition(record, new Date('3000-01-01T00:00:00.000Z'));
        assert.equal(transition.kind, 'none');
        assert.equal(transition.record.status, status);
    }
});

test('applyCheckIn rescues a grace-window switch back to armed', () => {
    const record = baseRecord({ status: 'grace' });
    const refreshed = applyCheckIn(record, new Date('2026-01-01T01:05:00.000Z'));
    assert.equal(refreshed.status, 'armed');
    assert.equal(refreshed.lastCheckInAt, '2026-01-01T01:05:00.000Z');
    assert.equal(refreshed.triggerAt, '2026-01-01T02:05:00.000Z');
    assert.equal(refreshed.releaseAt, '2026-01-01T02:15:00.000Z');
});

test('applyCheckIn refuses terminal switches', () => {
    assert.throws(
        () => applyCheckIn(baseRecord({ status: 'triggered' }), new Date()),
        /already triggered/
    );
    assert.throws(() => applyCheckIn(baseRecord({ status: 'cancelled' }), new Date()), /cancelled/);
});

test('validateArmInput enforces interval/grace/recipient bounds', () => {
    assert.equal(
        validateArmInput({
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: 600,
            recipients: ['r-1'],
            encryptedPayload: 'p',
        }),
        null
    );

    assert.match(
        validateArmInput({
            checkInIntervalSeconds: 1,
            gracePeriodSeconds: 0,
            recipients: ['r-1'],
            encryptedPayload: 'p',
        }) ?? '',
        /checkInIntervalSeconds/
    );

    assert.match(
        validateArmInput({
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: -1,
            recipients: ['r-1'],
            encryptedPayload: 'p',
        }) ?? '',
        /gracePeriodSeconds/
    );

    assert.match(
        validateArmInput({
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: 0,
            recipients: [],
            encryptedPayload: 'p',
        }) ?? '',
        /recipients/
    );

    assert.match(
        validateArmInput({
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: 0,
            recipients: ['r-1'],
            encryptedPayload: '',
        }) ?? '',
        /encryptedPayload/
    );
});

// Backlog windows. The base switch checked in at 00:00 with a one-hour interval
// and ten minutes of grace: triggerAt 01:00, releaseAt 01:10.
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const WINDOW_MS = DEADMAN_BACKLOG_GRACE_SECONDS * 1000;

test('the sweep acts on time when it reaches a switch inside the tolerance', () => {
    // Five minutes after the release: the sweep was running, between ticks.
    const transition = evaluateSweepTransition(
        baseRecord({ status: 'grace' }),
        new Date('2026-01-01T01:15:00.000Z'),
        FIFTEEN_MINUTES
    );
    assert.equal(transition.kind, 'triggered');
});

test('a switch the sweep reaches long after its release gets a 72-hour grace window, not a trigger', () => {
    assert.equal(DEADMAN_BACKLOG_GRACE_SECONDS, 72 * 60 * 60);
    const now = new Date('2026-01-01T09:00:00.000Z'); // eight hours late
    for (const status of ['armed', 'grace'] as const) {
        const transition = evaluateSweepTransition(baseRecord({ status }), now, FIFTEEN_MINUTES);
        assert.equal(transition.kind, 'backlog_grace', `${status}: not fired on the first sweep`);
        assert.equal(transition.record.status, 'grace');
        assert.equal(
            transition.record.releaseAt,
            new Date(now.getTime() + WINDOW_MS).toISOString()
        );
        assert.equal(transition.record.backlogGraceStartedAt, now.toISOString());
        // The check-in deadline and the owner's settings stay as they were.
        assert.equal(transition.record.triggerAt, '2026-01-01T01:00:00.000Z');
        assert.equal(transition.record.gracePeriodSeconds, 600);
    }
});

test('a switch with no grace period gets the window too', () => {
    const transition = evaluateSweepTransition(
        baseRecord({ gracePeriodSeconds: 0, releaseAt: '2026-01-01T01:00:00.000Z' }),
        new Date('2026-01-02T01:00:00.000Z'),
        FIFTEEN_MINUTES
    );
    assert.equal(transition.kind, 'backlog_grace');
});

test('an armed switch reached late, with less than 72 hours of grace left, gets the window', () => {
    // A day of grace: missing the deadline by twelve hours leaves twelve.
    const record = baseRecord({
        gracePeriodSeconds: 24 * 3600,
        releaseAt: '2026-01-02T01:00:00.000Z',
    });
    const now = new Date('2026-01-01T13:00:00.000Z');
    const transition = evaluateSweepTransition(record, now, FIFTEEN_MINUTES);
    assert.equal(transition.kind, 'backlog_grace');
    assert.equal(transition.record.releaseAt, new Date(now.getTime() + WINDOW_MS).toISOString());
});

test('a switch reached late with more than 72 hours of grace left follows the normal transition', () => {
    // Thirty days of grace: missing the deadline by a day still leaves 29.
    const record = baseRecord({
        gracePeriodSeconds: 30 * 24 * 3600,
        releaseAt: '2026-01-31T01:00:00.000Z',
    });
    const transition = evaluateSweepTransition(
        record,
        new Date('2026-01-02T01:00:00.000Z'),
        FIFTEEN_MINUTES
    );
    assert.equal(transition.kind, 'grace');
    assert.equal(transition.record.releaseAt, '2026-01-31T01:00:00.000Z');
    assert.equal(transition.record.backlogGraceStartedAt, undefined);
});

test('the tolerance is exclusive: at it the sweep fires, one millisecond past it the window opens', () => {
    const release = new Date('2026-01-01T01:10:00.000Z').getTime();
    const record = baseRecord({ status: 'grace' });
    const at = evaluateSweepTransition(
        record,
        new Date(release + FIFTEEN_MINUTES),
        FIFTEEN_MINUTES
    );
    assert.equal(at.kind, 'triggered');
    const past = new Date(release + FIFTEEN_MINUTES + 1);
    assert.equal(evaluateSweepTransition(record, past, FIFTEEN_MINUTES).kind, 'backlog_grace');
});

test('a switch that had its window fires when the window ends, however late the sweep is', () => {
    const now = new Date('2026-01-01T09:00:00.000Z');
    const windowed = evaluateSweepTransition(baseRecord(), now, FIFTEEN_MINUTES).record;
    // Inside the window: nothing happens.
    const inside = new Date(now.getTime() + WINDOW_MS - 1000);
    assert.equal(evaluateSweepTransition(windowed, inside, FIFTEEN_MINUTES).kind, 'none');
    // Another outage swallows the end of the window: no second window.
    const muchLater = new Date(now.getTime() + WINDOW_MS + 24 * 3600 * 1000);
    assert.equal(evaluateSweepTransition(windowed, muchLater, FIFTEEN_MINUTES).kind, 'triggered');
});

test('a check-in ends the backlog window, so the next lapse gets one of its own', () => {
    const now = new Date('2026-01-01T09:00:00.000Z');
    const windowed = evaluateSweepTransition(baseRecord(), now, FIFTEEN_MINUTES).record;
    assert.ok(windowed.backlogGraceStartedAt);

    const refreshed = applyCheckIn(windowed, new Date('2026-01-01T10:00:00.000Z'));
    assert.equal(refreshed.status, 'armed');
    assert.equal(refreshed.releaseAt, '2026-01-01T11:10:00.000Z');
    assert.equal(refreshed.backlogGraceStartedAt, undefined);
    assert.ok(
        Object.prototype.hasOwnProperty.call(refreshed, 'backlogGraceStartedAt'),
        'kept as an own property, so the Postgres write-through clears the column'
    );

    const nextLapse = new Date('2026-01-01T20:00:00.000Z');
    assert.equal(
        evaluateSweepTransition(refreshed, nextLapse, FIFTEEN_MINUTES).kind,
        'backlog_grace'
    );
});

test('the sweep leaves terminal switches alone however late it is', () => {
    for (const status of ['triggered', 'cancelled'] as const) {
        const transition = evaluateSweepTransition(
            baseRecord({ status }),
            new Date('3000-01-01T00:00:00.000Z'),
            FIFTEEN_MINUTES
        );
        assert.equal(transition.kind, 'none');
    }
});
