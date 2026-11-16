/**
 * The warrant canary's state (OSS-manifest group G9).
 *
 * A warrant canary is worth something for one reason: a person has to keep
 * saying it. When they can no longer say it truthfully they stop, and the
 * silence is the signal. So the server never writes or dates the statement
 * itself. Until 2026-11-16 it did: the route built the statement on every
 * request and dated it to the current month, so it renewed itself for ever
 * and would have gone on affirming "no secret orders" after one had arrived
 * (docs/security/trust-claims-2026-11-16.md).
 *
 * Now the operator issues it. Setting BLACKOUT_CANARY_ISSUED_ON to the date
 * (UTC, YYYY-MM-DD) on which they make the statement is the act of making it:
 * the server serves the statement with that date, for
 * BLACKOUT_CANARY_VALID_DAYS (35 unless set), and after that reports it as
 * lapsed, with the dates it had. With no date set, no canary has been issued
 * and the server says so. The server never advances the date.
 */

/** How long an issued statement stands unless BLACKOUT_CANARY_VALID_DAYS says otherwise. */
export const CANARY_DEFAULT_VALID_DAYS = 35;
/** The longest BLACKOUT_CANARY_VALID_DAYS that is accepted. */
export const CANARY_MAX_VALID_DAYS = 366;

export type WarrantCanary =
    | {
          status: 'not_issued';
          /** Why: no date is set, or the one that is set cannot be an issue date. */
          reason: 'no_date' | 'invalid_date' | 'future_date';
      }
    | {
          status: 'current' | 'lapsed';
          statement: string;
          /** The day the operator made the statement (UTC, YYYY-MM-DD). */
          issuedOn: string;
          /** The last day it stands (UTC, YYYY-MM-DD). */
          validUntil: string;
          /** What the digest and the signature are made over. */
          canonical: string;
      };

const DAY_MS = 86_400_000;

/** The UTC midnight of a YYYY-MM-DD date, or null where it is not a real date. */
const utcDay = (value: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    // Date.parse takes 2026-02-31 for 2 March: only a date that reads back the same is one.
    if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return null;
    return ms;
};

const dayString = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** BLACKOUT_CANARY_VALID_DAYS as a whole number of days from 1 to the maximum, or the default. */
export const canaryValidDays = (env: NodeJS.ProcessEnv = process.env): number => {
    const raw = env.BLACKOUT_CANARY_VALID_DAYS?.trim();
    if (!raw) return CANARY_DEFAULT_VALID_DAYS;
    const days = Number(raw);
    return Number.isInteger(days) && days >= 1 && days <= CANARY_MAX_VALID_DAYS
        ? days
        : CANARY_DEFAULT_VALID_DAYS;
};

/**
 * The statement, as of the day the operator issued it. The wording is the one
 * the route served before, with the operator's date in place of "the
 * generation date below".
 */
export const canaryStatement = (issuedOn: string): string =>
    [
        `As of ${issuedOn}, Blackout has not received any National`,
        'Security Letter, FISA court order, gag order, or other secret request for',
        'user data that we are prohibited from disclosing, and no warrant canary',
        'we maintain has been compelled to be removed.',
    ].join(' ');

/** What the canary is at `now`, from the operator's settings alone. */
export function readWarrantCanary(
    env: NodeJS.ProcessEnv = process.env,
    now: Date = new Date()
): WarrantCanary {
    const raw = env.BLACKOUT_CANARY_ISSUED_ON?.trim();
    if (!raw) return { status: 'not_issued', reason: 'no_date' };
    const issued = utcDay(raw);
    if (issued === null) return { status: 'not_issued', reason: 'invalid_date' };
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    // A statement cannot be made as of a day that has not come.
    if (issued > today) return { status: 'not_issued', reason: 'future_date' };

    const validUntilMs = issued + canaryValidDays(env) * DAY_MS;
    const issuedOn = dayString(issued);
    const validUntil = dayString(validUntilMs);
    const statement = canaryStatement(issuedOn);
    return {
        status: today > validUntilMs ? 'lapsed' : 'current',
        statement,
        issuedOn,
        validUntil,
        canonical: `${statement}|${issuedOn}|${validUntil}`,
    };
}

/** One sentence for a person reading the response: what the status means. */
export function describeWarrantCanary(canary: WarrantCanary): string {
    if (canary.status !== 'not_issued') {
        return canary.status === 'current'
            ? `The operator of this server made this statement on ${canary.issuedOn}. It stands until ${canary.validUntil} unless they renew it.`
            : `The operator of this server made this statement on ${canary.issuedOn} and has not renewed it; it lapsed after ${canary.validUntil}. A canary that is not renewed is the signal a canary exists to give. It can also mean only that nobody renewed it.`;
    }
    if (canary.reason === 'no_date') {
        return 'No warrant canary has been issued for this server. The server never makes this statement by itself: its operator issues it, with a date, and it lapses unless they renew it.';
    }
    return canary.reason === 'future_date'
        ? 'No warrant canary is in effect: the issue date set for this server is in the future, and a statement cannot be made as of a day that has not come.'
        : 'No warrant canary is in effect: the issue date set for this server is not a date (it must be YYYY-MM-DD).';
}
