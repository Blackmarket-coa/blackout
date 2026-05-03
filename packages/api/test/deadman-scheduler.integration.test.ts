import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCheckIn,
  computeDeadlines,
  evaluateTransition,
  validateArmInput,
} from '../src/services/deadmanScheduler';
import type { DeadmanSwitchRecord } from '../src/db/types';

const baseRecord = (
  overrides: Partial<DeadmanSwitchRecord> = {}
): DeadmanSwitchRecord => {
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
    const transition = evaluateTransition(
      record,
      new Date('3000-01-01T00:00:00.000Z')
    );
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
  assert.throws(
    () => applyCheckIn(baseRecord({ status: 'cancelled' }), new Date()),
    /cancelled/
  );
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
