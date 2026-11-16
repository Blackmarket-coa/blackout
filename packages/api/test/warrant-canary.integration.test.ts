/**
 * The warrant canary's state, on a fixed clock: what an issue date and a
 * number of days make of it at a given instant. The route's own tests
 * (transparency-routes.integration.test.ts) run on the real clock and stay
 * away from these edges.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

const {
    CANARY_DEFAULT_VALID_DAYS,
    CANARY_MAX_VALID_DAYS,
    canaryStatement,
    canaryValidDays,
    describeWarrantCanary,
    readWarrantCanary,
} = await import('../src/services/warrantCanary');

const at = (iso: string): Date => new Date(iso);
const env = (issuedOn?: string, validDays?: string): NodeJS.ProcessEnv => ({
    ...(issuedOn === undefined ? {} : { BLACKOUT_CANARY_ISSUED_ON: issuedOn }),
    ...(validDays === undefined ? {} : { BLACKOUT_CANARY_VALID_DAYS: validDays }),
});

test('with no issue date there is no canary, at any time: the server makes no statement of its own', () => {
    for (const now of ['2026-11-16T12:00:00Z', '2030-01-01T00:00:00Z']) {
        assert.deepEqual(readWarrantCanary(env(), at(now)), {
            status: 'not_issued',
            reason: 'no_date',
        });
    }
    assert.deepEqual(readWarrantCanary(env('   '), at('2026-11-16T12:00:00Z')), {
        status: 'not_issued',
        reason: 'no_date',
    });
});

test("an issued statement carries the operator's date, and the same one a month later: the server never advances it", () => {
    const first = readWarrantCanary(env('2026-11-16'), at('2026-11-16T00:00:00Z'));
    const later = readWarrantCanary(env('2026-11-16'), at('2026-12-20T23:59:59Z'));
    assert.equal(first.status, 'current');
    assert.equal(later.status, 'current');
    assert.deepEqual(later, first, 'nothing in it depends on when it is read');
    if (first.status === 'not_issued') return;
    assert.equal(first.issuedOn, '2026-11-16');
    assert.equal(first.validUntil, '2026-12-21', '35 days on');
    assert.equal(first.statement, canaryStatement('2026-11-16'));
    assert.ok(first.statement.startsWith('As of 2026-11-16, Blackout has not received'));
    assert.equal(first.canonical, `${first.statement}|2026-11-16|2026-12-21`);
});

test('a statement stands through its last day and has lapsed the day after, by the UTC date', () => {
    const issued = env('2026-11-16');
    assert.equal(readWarrantCanary(issued, at('2026-12-21T00:00:00Z')).status, 'current');
    assert.equal(readWarrantCanary(issued, at('2026-12-21T23:59:59.999Z')).status, 'current');
    const after = readWarrantCanary(issued, at('2026-12-22T00:00:00Z'));
    assert.equal(after.status, 'lapsed');
    if (after.status === 'not_issued') return;
    assert.equal(after.issuedOn, '2026-11-16', 'a lapsed statement keeps the dates it had');
    assert.equal(after.validUntil, '2026-12-21');
    assert.equal(after.statement, canaryStatement('2026-11-16'), 'and its wording');
    assert.equal(readWarrantCanary(issued, at('2031-06-01T00:00:00Z')).status, 'lapsed');
});

test('the days a statement stands: 35 unless set to a whole number from 1 to 366', () => {
    assert.equal(CANARY_DEFAULT_VALID_DAYS, 35);
    assert.equal(CANARY_MAX_VALID_DAYS, 366);
    assert.equal(canaryValidDays(env()), 35);
    assert.equal(canaryValidDays(env(undefined, '1')), 1);
    assert.equal(canaryValidDays(env(undefined, ' 90 ')), 90);
    assert.equal(canaryValidDays(env(undefined, '366')), 366);
    for (const bad of ['0', '-1', '367', '2.5', '1e2x', 'a month', '']) {
        assert.equal(canaryValidDays(env(undefined, bad)), 35, `"${bad}" is not accepted`);
    }
    const week = readWarrantCanary(env('2026-11-16', '7'), at('2026-11-23T12:00:00Z'));
    assert.equal(week.status, 'current');
    if (week.status !== 'not_issued') assert.equal(week.validUntil, '2026-11-23');
    assert.equal(
        readWarrantCanary(env('2026-11-16', '7'), at('2026-11-24T00:00:00Z')).status,
        'lapsed'
    );
    // Across a leap day and a year end.
    const leap = readWarrantCanary(env('2028-02-20', '10'), at('2028-02-25T00:00:00Z'));
    if (leap.status !== 'not_issued') assert.equal(leap.validUntil, '2028-03-01');
    const yearEnd = readWarrantCanary(env('2026-12-20'), at('2026-12-25T00:00:00Z'));
    if (yearEnd.status !== 'not_issued') assert.equal(yearEnd.validUntil, '2027-01-24');
});

test('an issue date that is not a date is no statement', () => {
    for (const value of [
        'yesterday',
        '2026-02-31',
        '2026-13-01',
        '2026-11-16T00:00:00Z',
        '16/11/2026',
        '20261116',
        '2026-1-6',
    ]) {
        assert.deepEqual(
            readWarrantCanary(env(value), at('2026-11-16T12:00:00Z')),
            { status: 'not_issued', reason: 'invalid_date' },
            value
        );
    }
});

test('an issue date that has not come is no statement; the day itself is', () => {
    assert.deepEqual(readWarrantCanary(env('2026-11-17'), at('2026-11-16T23:59:59Z')), {
        status: 'not_issued',
        reason: 'future_date',
    });
    assert.equal(
        readWarrantCanary(env('2026-11-17'), at('2026-11-17T00:00:00Z')).status,
        'current'
    );
});

test('the sentence that explains each state says what the state is, and no more', () => {
    const current = describeWarrantCanary(
        readWarrantCanary(env('2026-11-16'), at('2026-11-20T00:00:00Z'))
    );
    assert.equal(
        current,
        'The operator of this server made this statement on 2026-11-16. It stands until 2026-12-21 unless they renew it.'
    );
    const lapsed = describeWarrantCanary(
        readWarrantCanary(env('2026-11-16'), at('2027-01-01T00:00:00Z'))
    );
    assert.match(
        lapsed,
        /made this statement on 2026-11-16 and has not renewed it; it lapsed after 2026-12-21/
    );
    assert.match(
        describeWarrantCanary({ status: 'not_issued', reason: 'no_date' }),
        /^No warrant canary has been issued for this server\./
    );
    assert.match(
        describeWarrantCanary({ status: 'not_issued', reason: 'future_date' }),
        /is in the future/
    );
    assert.match(
        describeWarrantCanary({ status: 'not_issued', reason: 'invalid_date' }),
        /is not a date/
    );
});
