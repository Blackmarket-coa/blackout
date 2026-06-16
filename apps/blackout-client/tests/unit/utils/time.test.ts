import { describe, expect, it } from 'vitest';
import {
    daysInMonth,
    daysToMs,
    getToday,
    getYesterday,
    hour12to24,
    hour24to12,
    hoursToMs,
    inSameDay,
    minuteDifference,
    minutesToMs,
    secondsToMs,
    timeAmPm,
    timeDay,
    timeDayMonthYear,
    timeDayMonYear,
    timeHour,
    timeHourMinute,
    timeMinute,
    timeMon,
    timeMonth,
    timeYear,
    today,
} from '../../../src/app/utils/time';

// Local-time constructor avoids timezone-dependent assertions: dayjs formats
// in the same local zone the Date was built in.
const at = (y: number, mIdx: number, d: number, h = 0, min = 0) => new Date(y, mIdx, d, h, min).getTime();

describe('time formatters', () => {
    const ts = at(2023, 0, 5, 9, 7); // 2023-01-05 09:07 local

    it('formats individual components', () => {
        expect(timeMinute(ts)).toBe('07');
        expect(timeDay(ts)).toBe('5');
        expect(timeMon(ts)).toBe('Jan');
        expect(timeMonth(ts)).toBe('January');
        expect(timeYear(ts)).toBe('2023');
        expect(timeAmPm(ts)).toBe('AM');
    });

    it('honours the 24h vs 12h clock flag', () => {
        expect(timeHour(ts, true)).toBe('09');
        expect(timeHour(ts, false)).toBe('09');
        expect(timeHour(at(2023, 0, 5, 18), true)).toBe('18');
        expect(timeHour(at(2023, 0, 5, 18), false)).toBe('06');
        expect(timeHourMinute(ts, true)).toBe('09:07');
        expect(timeHourMinute(ts, false)).toBe('09:07 AM');
    });

    it('formats full dates', () => {
        expect(timeDayMonthYear(ts)).toBe('5 January 2023');
        expect(timeDayMonYear(ts, 'YYYY-MM-DD')).toBe('2023-01-05');
    });
});

describe('date math', () => {
    it('daysInMonth handles leap years', () => {
        expect(daysInMonth(2, 2024)).toBe(29);
        expect(daysInMonth(2, 2023)).toBe(28);
        expect(daysInMonth(1, 2023)).toBe(31);
    });

    it('inSameDay compares calendar days', () => {
        expect(inSameDay(at(2023, 0, 5, 1), at(2023, 0, 5, 23))).toBe(true);
        expect(inSameDay(at(2023, 0, 5), at(2023, 0, 6))).toBe(false);
    });

    it('minuteDifference returns absolute whole minutes', () => {
        expect(minuteDifference(at(2023, 0, 5, 9, 0), at(2023, 0, 5, 9, 5))).toBe(5);
        expect(minuteDifference(at(2023, 0, 5, 9, 5), at(2023, 0, 5, 9, 0))).toBe(5);
    });
});

describe('hour conversions', () => {
    it('hour24to12 maps 0 and 12 to 12', () => {
        expect(hour24to12(0)).toBe(12);
        expect(hour24to12(12)).toBe(12);
        expect(hour24to12(13)).toBe(1);
        expect(hour24to12(23)).toBe(11);
    });

    it('hour12to24 respects the pm flag', () => {
        expect(hour12to24(12, false)).toBe(0);
        expect(hour12to24(12, true)).toBe(12);
        expect(hour12to24(9, false)).toBe(9);
        expect(hour12to24(9, true)).toBe(21);
    });
});

describe('duration helpers', () => {
    it('convert to milliseconds', () => {
        expect(secondsToMs(5)).toBe(5000);
        expect(minutesToMs(1)).toBe(60_000);
        expect(hoursToMs(1)).toBe(3_600_000);
        expect(daysToMs(1)).toBe(86_400_000);
    });
});

describe('today / getToday / getYesterday', () => {
    it('today() recognises now but not the epoch', () => {
        expect(today(Date.now())).toBe(true);
        expect(today(0)).toBe(false);
    });

    it('getYesterday precedes getToday', () => {
        expect(getYesterday()).toBeLessThan(getToday());
        expect(typeof getToday()).toBe('number');
    });
});
