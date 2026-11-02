/**
 * Dead-man switches in the release format, on the server's side
 * (`docs/security/release-envelope-2026-10-26.md`, §6, §8, §11 and §15;
 * design §4(a) steps 3 and 4): arming, re-sealing, the recipient's read, the
 * trigger's bookkeeping and the removal after 365 days.
 *
 * The owner's device encrypts the message once and seals its key to each
 * recipient's release identity and to the owner's own; the server stores the
 * header (the ciphertext and a commitment to the key) with the owner's
 * public identity as it was at arming, and one sealed copy per account. It
 * never holds the key or the text. Every check on arming and re-sealing is
 * the one the clients also run, plus what only the server knows (which
 * identity is current, which release ids are taken): they catch client bugs,
 * and a hostile server would skip them, so nothing a recipient trusts rests
 * on them (`openReleaseCopy` and `releaseComparisonState` do that work).
 *
 * Arming is closed unless `BLACKOUT_DEADMAN_RELEASES` is on, which it is
 * nowhere until PR 4, and unless this process's own environment runs the
 * sweep (`BLACKOUT_DEADMAN_SWEEP` not `0`): a switch armed where no sweep runs
 * would never fire. The flag gates arming only, so a switch armed while it
 * was on keeps firing, being served and being notified if it is turned off
 * (a flag that could hold a release back would be one more way to do it).
 *
 * What one account can make the server keep is bounded (independent review
 * of part 2, P3b-H1): at most `DEADMAN_MAX_LIVE_RELEASE_SWITCHES` release
 * switches per owner whose content is still held (armed, in grace, or fired
 * until the 365-day removal), at most `DEADMAN_MAX_ARMS_PER_DAY` arms per
 * owner in any 24 hours, and per recipient at most
 * `DEADMAN_MAX_HELD_RELEASES_PER_RECIPIENT_FROM_OWNER` held releases naming
 * them from one owner and at most `DEADMAN_MAX_OWNERS_NAMING_RECIPIENT`
 * distinct owners with a held release naming them (decision 18, option (c)).
 * `GET /limits` reports each. Each bound is checked before the
 * signatures, so a refused arm costs no verification, and again after them
 * with nothing yielding before the writes, so on one replica the bounds hold
 * against arms sent at once; across replicas the store is eventually
 * consistent and each can be exceeded within its refresh window. The bounds
 * are on content: the rows of a cancelled release switch stay (§15).
 */
import {
    DEADMAN_LABEL_MAX_LENGTH,
    DEADMAN_MAX_ARMS_PER_DAY,
    DEADMAN_MAX_HELD_RELEASES_PER_RECIPIENT_FROM_OWNER,
    DEADMAN_MAX_LIVE_RELEASE_SWITCHES,
    DEADMAN_MAX_OWNERS_NAMING_RECIPIENT,
    DEADMAN_NOTICE_RETRY_DAYS,
    DEADMAN_RELEASE_FORMAT,
    DEADMAN_RELEASE_RETENTION_DAYS,
    RELEASE_MAX_RECIPIENTS,
    RELEASE_MESSAGE_MAX_BYTES,
    RELEASE_PADDED_SIZES,
    parseReleaseCopy,
    parseReleaseEnvelope,
    parseReleaseHeader,
    publicReleaseIdentity,
    releaseHeaderOf,
    releaseSignatureVerifier,
    type DeadmanLimits,
    type DeadmanNoticeCounts,
    type DeadmanOwnerRelease,
    type DeadmanReleasedCopy,
    type ReleaseCopy,
    type ReleaseEnvelope,
    type ReleaseEnvelopeProblem,
    type ReleaseHeader,
    type ReleaseIdentity,
} from '@blackout/protocol';
import { db } from '../db/store';
import type { DeadmanReleaseWrapRecord, DeadmanSwitchRecord } from '../db/types';
import {
    MAX_CHECK_IN_INTERVAL_SECONDS,
    MAX_GRACE_PERIOD_SECONDS,
    MIN_CHECK_IN_INTERVAL_SECONDS,
    MIN_GRACE_PERIOD_SECONDS,
    computeDeadlines,
    DEADMAN_BACKLOG_GRACE_SECONDS,
} from './deadmanScheduler';
import { recordToReleaseIdentity } from './releaseIdentities';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a released switch's content and copies are kept. */
export const DEADMAN_RELEASE_RETENTION_MS = DEADMAN_RELEASE_RETENTION_DAYS * DAY_MS;

/**
 * Whether this deployment takes release switches: `BLACKOUT_DEADMAN_RELEASES`,
 * read per request; on for `1` or `true` in any casing, surrounding whitespace
 * ignored, and off for anything else (`yes` and `on` included).
 */
export const releasesEnabled = (): boolean => {
    const value = (process.env.BLACKOUT_DEADMAN_RELEASES ?? '').trim().toLowerCase();
    return value === '1' || value === 'true';
};

/**
 * Whether this process's environment runs the dead-man sweep, read as
 * `backgroundLoops.ts` reads it. A deployment that runs the loops in a
 * separate worker sets this on the API too (nothing else tells the API that a
 * sweep runs anywhere), and an API that reads `0` arms nothing: a switch armed
 * here would never fire, be served or be notified.
 */
export const sweepConfigured = (): boolean => process.env.BLACKOUT_DEADMAN_SWEEP !== '0';

export type ArmingUnavailableReason = 'releases_off' | 'sweep_off';

/** Whether arming is open here, and if not, the first reason it is not. */
export const armingAvailability = ():
    | { available: true }
    | { available: false; reason: ArmingUnavailableReason } => {
    if (!releasesEnabled()) return { available: false, reason: 'releases_off' };
    if (!sweepConfigured()) return { available: false, reason: 'sweep_off' };
    return { available: true };
};

/** A switch armed in the release format; everything else is `legacy`, rows from before 106 included. */
export const isReleaseSwitch = (record: DeadmanSwitchRecord): boolean =>
    record.releaseFormat === DEADMAN_RELEASE_FORMAT;

/** A copy the store still holds: cancel, deletion and removal blank both fields. */
export const wrapIsHeld = (wrap: DeadmanReleaseWrapRecord): boolean =>
    wrap.sealedKey !== '' && wrap.signature !== '';

/**
 * When a release's content and copies become due for removal: 365 days after
 * it fired. The sweep removes them at its first pass on or after this time,
 * while a sweep runs (`removeExpiredReleases`).
 */
export const removesAt = (releasedAt: string): string =>
    new Date(Date.parse(releasedAt) + DEADMAN_RELEASE_RETENTION_MS).toISOString();

/** What a release switch keeps in `encryptedPayload`: the header and the owner's identity at arming. */
export type StoredRelease = { header: ReleaseHeader; ownerIdentity: ReleaseIdentity };

const IDENTITY_FIELDS: readonly (keyof ReleaseIdentity)[] = [
    'v',
    'accountId',
    'signingKey',
    'x25519Key',
    'mlkem768Key',
    'signature',
];

const isIdentityShape = (value: unknown): value is ReleaseIdentity => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return (
        candidate.v === 1 &&
        IDENTITY_FIELDS.slice(1).every((field) => typeof candidate[field] === 'string')
    );
};

/**
 * The release a switch holds, or null for a legacy switch (whatever its
 * payload holds), a release whose content was removed (the column is empty,
 * which is not JSON), or a row that does not parse (which only a corrupted
 * store produces: the fields were checked before they were written).
 */
export const storedRelease = (record: DeadmanSwitchRecord): StoredRelease | null => {
    if (!isReleaseSwitch(record)) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(record.encryptedPayload);
    } catch {
        return null;
    }
    if (typeof raw !== 'object' || raw === null) return null;
    const { header, ownerIdentity } = raw as { header?: unknown; ownerIdentity?: unknown };
    const parsed = parseReleaseHeader(header);
    if (!parsed.ok || !isIdentityShape(ownerIdentity)) return null;
    return { header: parsed.value, ownerIdentity: publicReleaseIdentity(ownerIdentity) };
};

const encodeStoredRelease = (release: StoredRelease): string =>
    JSON.stringify({ header: release.header, ownerIdentity: release.ownerIdentity });

/** The bounds the arming form shows, and whether arming is open here and why not. */
export const releaseLimits = (sweep: { backlogToleranceMs: number }): DeadmanLimits => ({
    ...availabilityFields(),
    checkInIntervalSeconds: {
        min: MIN_CHECK_IN_INTERVAL_SECONDS,
        max: MAX_CHECK_IN_INTERVAL_SECONDS,
    },
    gracePeriodSeconds: { min: MIN_GRACE_PERIOD_SECONDS, max: MAX_GRACE_PERIOD_SECONDS },
    maxRecipients: RELEASE_MAX_RECIPIENTS,
    maxMessageBytes: RELEASE_MESSAGE_MAX_BYTES,
    paddedSizes: [...RELEASE_PADDED_SIZES],
    labelMaxLength: DEADMAN_LABEL_MAX_LENGTH,
    maxLiveReleaseSwitches: DEADMAN_MAX_LIVE_RELEASE_SWITCHES,
    maxArmsPerDay: DEADMAN_MAX_ARMS_PER_DAY,
    maxHeldReleasesPerRecipientFromOwner: DEADMAN_MAX_HELD_RELEASES_PER_RECIPIENT_FROM_OWNER,
    maxOwnersNamingRecipient: DEADMAN_MAX_OWNERS_NAMING_RECIPIENT,
    backlogToleranceSeconds: Math.round(sweep.backlogToleranceMs / 1000),
    backlogGraceSeconds: DEADMAN_BACKLOG_GRACE_SECONDS,
    releaseRetentionDays: DEADMAN_RELEASE_RETENTION_DAYS,
    noticeRetryDays: DEADMAN_NOTICE_RETRY_DAYS,
});

const availabilityFields = (): Pick<
    DeadmanLimits,
    'armingAvailable' | 'armingUnavailableReason'
> => {
    const availability = armingAvailability();
    return availability.available
        ? { armingAvailable: true }
        : { armingAvailable: false, armingUnavailableReason: availability.reason };
};

/** The timer and label, in the bounds of today; the message says which is out. */
export const validateReleaseTimer = (input: {
    checkInIntervalSeconds: number;
    gracePeriodSeconds: number;
    label?: string;
}): string | null => {
    if (
        !Number.isInteger(input.checkInIntervalSeconds) ||
        input.checkInIntervalSeconds < MIN_CHECK_IN_INTERVAL_SECONDS ||
        input.checkInIntervalSeconds > MAX_CHECK_IN_INTERVAL_SECONDS
    ) {
        return `checkInIntervalSeconds must be between ${MIN_CHECK_IN_INTERVAL_SECONDS} and ${MAX_CHECK_IN_INTERVAL_SECONDS}`;
    }
    if (
        !Number.isInteger(input.gracePeriodSeconds) ||
        input.gracePeriodSeconds < MIN_GRACE_PERIOD_SECONDS ||
        input.gracePeriodSeconds > MAX_GRACE_PERIOD_SECONDS
    ) {
        return `gracePeriodSeconds must be between ${MIN_GRACE_PERIOD_SECONDS} and ${MAX_GRACE_PERIOD_SECONDS}`;
    }
    if (input.label !== undefined && input.label.length > DEADMAN_LABEL_MAX_LENGTH) {
        return `label must be at most ${DEADMAN_LABEL_MAX_LENGTH} characters`;
    }
    return null;
};

/** A release switch whose content the store still holds: armed, in grace, or fired and not yet removed. */
export const releaseContentHeld = (record: DeadmanSwitchRecord): boolean =>
    isReleaseSwitch(record) && record.encryptedPayload !== '';

/**
 * The arms this process is writing: each one's rows are counted toward every
 * bound, and its id is taken, from the moment its checks passed until the
 * store has answered (round 11 of part 2's review: in Postgres the arm now
 * awaits its own insert, so between the checks and the row a second arm would
 * otherwise read the counts without it and both would pass the bound). By
 * release id; removed when the store has answered and the arm has looked at
 * its owner once more, whatever it answers; `done` settles then, so the
 * owner's deletion can wait for an arm already past its checks
 * (`armsInFlightSettledFor`).
 */
const armsInFlight = new Map<
    string,
    { ownerId: string; recipients: string[]; armedAt: number; done: Promise<void> }
>();

const armsInFlightOf = (ownerId: string) =>
    [...armsInFlight.values()].filter((arm) => arm.ownerId === ownerId);

/**
 * Settles once every arm of `ownerId`'s that this process is writing has been
 * answered (the owner's deletion waits for it before it lists the owner's
 * switches: round 13 of part 2's review found an arm whose insert was still
 * being written when the deletion listed them, which landed after and stayed
 * armed for an account that was gone). An arm whose checks pass after the
 * deletion's synchronous writes is refused: the account and its identities are
 * gone by then.
 */
export const armsInFlightSettledFor = async (ownerId: string): Promise<void> => {
    await Promise.all(armsInFlightOf(ownerId).map((arm) => arm.done));
};

/**
 * Release switches of one owner whose content is still held, the ones this
 * process is writing included. Cancel and the 365-day removal blank the
 * content, so a cancelled switch and a removed release do not count; a fired
 * one does until it is removed. Legacy switches never count: they are not
 * release switches.
 */
export const heldReleaseSwitchCount = (ownerId: string): number =>
    db.listDeadmanSwitchesForOwner(ownerId).filter(releaseContentHeld).length +
    armsInFlightOf(ownerId).length;

const ARM_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Whether one more arm fits the owner's 24-hour window, counting every release
 * switch the owner armed in it (cancelled ones included: the arm happened, and
 * rows are never deleted) and the ones this process is writing. When it does
 * not, how long until one does: when the (n − limit + 1)-th oldest arm leaves
 * the window, as the identities directory computes its publish limit
 * (`services/releaseIdentities.ts`).
 */
export const armRateState = (
    ownerId: string,
    now: Date
): { ok: true } | { ok: false; retryAfterSeconds: number } => {
    const at = now.getTime();
    const recent = db
        .listDeadmanSwitchesForOwner(ownerId)
        .filter(isReleaseSwitch)
        .map((record) => Date.parse(record.createdAt))
        .concat(armsInFlightOf(ownerId).map((arm) => arm.armedAt))
        .filter((armedAt) => armedAt > at - ARM_WINDOW_MS)
        .sort((a, b) => a - b);
    if (recent.length < DEADMAN_MAX_ARMS_PER_DAY) return { ok: true };
    const opensAt = recent[recent.length - DEADMAN_MAX_ARMS_PER_DAY] + ARM_WINDOW_MS;
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((opensAt - at) / 1000)) };
};

/**
 * How many held releases name `recipientAccountId`: a copy sealed to them on
 * a release switch whose content is held and which they do not own (the
 * owner's own copy names nobody), the arms this process is writing included.
 * Per owner (`fromOwner`, whose size is the number of distinct owners naming
 * them), and in all (`total`). Whether the copy itself is still held is not
 * asked: a blanked copy on a switch whose content is held means the recipient
 * deleted their account, and nobody names a deleted account, or a removal
 * half done, whose content goes on the next pass. The copies are listed by
 * recipient through the store's index, so this costs the rows that name the
 * person, not every copy row.
 */
export const heldReleasesNaming = (
    recipientAccountId: string
): { fromOwner: Map<string, number>; total: number } => {
    const fromOwner = new Map<string, number>();
    let total = 0;
    for (const wrap of db.listDeadmanReleaseWrapsForRecipient(recipientAccountId)) {
        const record = db.getDeadmanSwitch(wrap.switchId);
        if (!record || record.ownerId === recipientAccountId || !releaseContentHeld(record)) {
            continue;
        }
        total += 1;
        fromOwner.set(record.ownerId, (fromOwner.get(record.ownerId) ?? 0) + 1);
    }
    for (const arm of armsInFlight.values()) {
        if (!arm.recipients.includes(recipientAccountId)) continue;
        total += 1;
        fromOwner.set(arm.ownerId, (fromOwner.get(arm.ownerId) ?? 0) + 1);
    }
    return { fromOwner, total };
};

/**
 * Whether one more held release from `ownerId` may name `recipientAccountId`:
 * at most `DEADMAN_MAX_HELD_RELEASES_PER_RECIPIENT_FROM_OWNER` from this
 * owner, and at most `DEADMAN_MAX_OWNERS_NAMING_RECIPIENT` distinct owners
 * naming them. An owner that already names the person is one of those owners,
 * so its next release is bounded only by the first; an owner that does not is
 * refused once that many others do (decision 18, option (c), the operator's
 * choice of 2026-10-31: counted in releases, ten accounts filled it; counted
 * in owners, it takes fifty). Both are refused with one code
 * (`recipient_limit`), which hides nothing: an owner that has never named the
 * person and is refused can tell that fifty other owners do (a bound on what
 * everyone together may do to one person cannot avoid it).
 */
export const recipientHasRoom = (ownerId: string, recipientAccountId: string): boolean => {
    const naming = heldReleasesNaming(recipientAccountId);
    const mine = naming.fromOwner.get(ownerId) ?? 0;
    if (mine >= DEADMAN_MAX_HELD_RELEASES_PER_RECIPIENT_FROM_OWNER) return false;
    return mine > 0 || naming.fromOwner.size < DEADMAN_MAX_OWNERS_NAMING_RECIPIENT;
};

/**
 * Where a copy's fingerprint stands against its account's directory entry.
 * An account that does not exist here has no identities (publishing needs
 * the account, and deletion blanks its rows), so `no_identity` covers it;
 * outside it is `unknown_recipient`, since the directory says no more than
 * whether someone has published.
 */
export type RecipientIdentityState = 'current' | 'superseded' | 'unknown_identity' | 'no_identity';

export const recipientIdentityState = (
    accountId: string,
    fingerprint: string
): RecipientIdentityState => {
    const history = db.listReleaseIdentitiesForAccount(accountId);
    if (history.length === 0) return 'no_identity';
    const current = history.find((record) => !record.supersededAt);
    if (current && current.fingerprint === fingerprint) return 'current';
    if (history.some((record) => record.fingerprint === fingerprint)) return 'superseded';
    return 'unknown_identity';
};

export type RecipientRefusal =
    | { kind: 'unknown_recipient'; recipientAccountId: string }
    | { kind: 'recipient_identity_superseded'; recipientAccountId: string }
    | { kind: 'recipient_identity_unknown'; recipientAccountId: string };

const refuseRecipient = (
    state: Exclude<RecipientIdentityState, 'current'>,
    recipientAccountId: string
): RecipientRefusal => {
    switch (state) {
        case 'superseded':
            return { kind: 'recipient_identity_superseded', recipientAccountId };
        case 'unknown_identity':
            return { kind: 'recipient_identity_unknown', recipientAccountId };
        default:
            return { kind: 'unknown_recipient', recipientAccountId };
    }
};

export type OwnerIdentityRefusal =
    | { kind: 'owner_identity_missing' }
    | { kind: 'owner_identity_changed' };

/** The owner's account is gone (`no_account`): arming and re-sealing are refused for it. */
export type OwnerAccountRefusal = { kind: 'no_account' };

const ownerAccountGone = (ownerId: string): boolean => db.getUserById(ownerId) === undefined;

/**
 * The owner's current identity in the directory. Whether it is the one the
 * header names is the verifier's to say: `releaseSignatureVerifier` computes
 * the identity's fingerprint and refuses a header with another
 * (`owner_identity`, answered as `owner_identity_changed`), so no comparison
 * is made here that it would make again.
 */
const currentOwnerIdentity = (
    ownerId: string
):
    | { ok: true; identity: ReleaseIdentity; recordId: string }
    | { ok: false; refusal: OwnerIdentityRefusal } => {
    const current = db.getCurrentReleaseIdentity(ownerId);
    if (!current) return { ok: false, refusal: { kind: 'owner_identity_missing' } };
    return { ok: true, identity: recordToReleaseIdentity(current), recordId: current.id };
};

/**
 * Whether the identities the signatures were checked against are still the
 * current ones, read again after the awaits of an arm or a re-seal: the
 * owner's current identity is the row the verifier was built from (one
 * replaced meanwhile is `owner_identity_changed`, one erased by the owner's
 * deletion `owner_identity_missing`), and each recipient's current identity
 * is still the copy's (the recipient's own refusals). Without this a
 * recipient who rotated during the verification got a held copy sealed to a
 * replaced key, and one who deleted their account a held copy that their
 * deletion's blanking pass had already run past (round 3 of part 2's review
 * for arming, round 4 for re-sealing).
 */
const identitiesStillCurrent = (
    ownerId: string,
    ownerRecordId: string,
    copies: ReleaseEnvelope['copies']
): OwnerIdentityRefusal | RecipientRefusal | null => {
    const owner = db.getCurrentReleaseIdentity(ownerId);
    if (!owner) return { kind: 'owner_identity_missing' };
    if (owner.id !== ownerRecordId) return { kind: 'owner_identity_changed' };
    for (const copy of copies) {
        if (copy.recipientAccountId === ownerId) continue;
        const state = recipientIdentityState(copy.recipientAccountId, copy.recipientFingerprint);
        if (state !== 'current') return refuseRecipient(state, copy.recipientAccountId);
    }
    return null;
};

/**
 * The owner's two bounds, in the order the route answers them: room for one
 * more release switch with content held, then the 24-hour arming rate. Run
 * before the signatures and again right before the writes.
 */
const ownerBoundsRefusal = (
    ownerId: string,
    now: Date
): { kind: 'held_limit' } | { kind: 'rate_limited'; retryAfterSeconds: number } | null => {
    if (heldReleaseSwitchCount(ownerId) >= DEADMAN_MAX_LIVE_RELEASE_SWITCHES) {
        return { kind: 'held_limit' };
    }
    const rate = armRateState(ownerId, now);
    if (!rate.ok) return { kind: 'rate_limited', retryAfterSeconds: rate.retryAfterSeconds };
    return null;
};

export type ArmReleaseInput = {
    checkInIntervalSeconds: number;
    gracePeriodSeconds: number;
    label?: string;
    envelope: unknown;
};

export type ArmReleaseOutcome =
    | { kind: 'armed'; record: DeadmanSwitchRecord; envelope: ReleaseEnvelope }
    | { kind: 'invalid_envelope'; problem: ReleaseEnvelopeProblem }
    | { kind: 'not_yours' }
    | { kind: 'invalid'; message: string }
    | { kind: 'held_limit' }
    | { kind: 'rate_limited'; retryAfterSeconds: number }
    | { kind: 'recipient_limit'; recipientAccountId: string }
    | { kind: 'id_taken' }
    /**
     * The owner's account no longer exists: deleted by the time the arm was
     * checked, or while its switch was written (the switch it wrote is then
     * erased before the answer). Answered 404 `user_not_found`, as publishing
     * a release identity is.
     */
    | OwnerAccountRefusal
    /**
     * The database did not answer the switch's write in time (Postgres): one
     * that was sent may still land; one refused at once while another switch
     * statement stood unanswered was not sent, and cannot. Or the write
     * failed and the switch could not be read afterwards.
     */
    | { kind: 'write_unanswered' }
    /** The switch's write failed and a read afterwards found no switch: nothing is armed. */
    | { kind: 'write_failed' }
    | OwnerIdentityRefusal
    | RecipientRefusal
    | { kind: 'invalid_signature'; recipientAccountId: string };

/**
 * Arm a release switch for `ownerId` (§8, "the API, on arming"), in this
 * order: the envelope's form; the caller is its owner; the timer and label
 * are in bounds; the owner has room for one more release switch with content
 * held (`held_limit`) and has not armed `DEADMAN_MAX_ARMS_PER_DAY` in the
 * last 24 hours (`rate_limited`, with how long until one fits); the owner
 * has a current identity; every other copy names an account here whose
 * current identity is the copy's (an account without an identity, a
 * replaced identity and one never published each have their own answer) and
 * which the per-recipient bounds still let this owner name: fewer than five
 * held releases of this owner's, and either one of them already or fewer than
 * fifty other owners naming it (`recipient_limit`); every signature verifies under the owner's identity,
 * which also refuses a header naming another identity than the owner's
 * current one; and, after the signatures awaited, the release id is still
 * free, every bound still has room, and the owner's and every recipient's
 * current identity is still the one checked, and the owner's account still
 * exists. The rows are then written in one awaited store call, each of its
 * statements awaited in Postgres, the copies first and the switch last, and
 * nothing deletes a copy, so a crash between them, a failed arm or one that
 * finds the id taken leaves copies without a switch, which nothing lists or
 * serves, rather than a switch without copies, which would fire and release
 * to nobody. The bounds and the identities are checked twice on purpose:
 * before the signatures, so a refused arm costs no verification, and after
 * them, because a burst of arms that all passed the first checks against the
 * same counts resumes here one at a time, and a recipient may have rotated
 * or deleted during the awaits. Nothing yields between the second check and
 * the moment the arm is counted as one this process is writing
 * (`armsInFlight`), which counts toward every bound until the store has
 * answered, and a database stall refuses every arm until a landed row is in
 * the mirror, so on one process exactly the bound passes and every copy
 * written is sealed to a current key (rounds 2, 3, 11 and 12 of part 2's
 * review); across replicas the store is eventually consistent and a bound can
 * be exceeded within its refresh window. Once the store has answered, the
 * owner's account is looked at once more: where the owner's deletion ran
 * while the rows were written, the switch is erased again before the answer
 * and the arm is refused `no_account` (round 13: such an arm was answered 201
 * and its switch, which the deletion had not listed, stayed armed and fired
 * for an account that was gone).
 */
export const armReleaseSwitch = async (input: {
    ownerId: string;
    input: ArmReleaseInput;
    now?: Date;
}): Promise<ArmReleaseOutcome> => {
    const parsed = parseReleaseEnvelope(input.input.envelope);
    if (!parsed.ok) return { kind: 'invalid_envelope', problem: parsed.problem };
    const envelope = parsed.value;
    if (envelope.ownerAccountId !== input.ownerId) return { kind: 'not_yours' };
    // The account must still exist: another session of an account being
    // deleted must not arm in its name (round 13 of part 2's review).
    if (ownerAccountGone(input.ownerId)) return { kind: 'no_account' };

    const timerProblem = validateReleaseTimer(input.input);
    if (timerProblem) return { kind: 'invalid', message: timerProblem };
    const now = input.now ?? new Date();
    const ownerBounds = ownerBoundsRefusal(input.ownerId, now);
    if (ownerBounds) return ownerBounds;
    const owner = currentOwnerIdentity(input.ownerId);
    if (!owner.ok) return owner.refusal;

    const recipients: string[] = [];
    for (const copy of envelope.copies) {
        if (copy.recipientAccountId === input.ownerId) continue;
        const state = recipientIdentityState(copy.recipientAccountId, copy.recipientFingerprint);
        if (state !== 'current') return refuseRecipient(state, copy.recipientAccountId);
        if (!recipientHasRoom(input.ownerId, copy.recipientAccountId)) {
            return { kind: 'recipient_limit', recipientAccountId: copy.recipientAccountId };
        }
        recipients.push(copy.recipientAccountId);
    }

    const header = releaseHeaderOf(envelope);
    const verifier = await releaseSignatureVerifier(header, owner.identity);
    if (!verifier.ok) {
        if (verifier.problem === 'unsupported') {
            throw new Error('dead-man releases: this runtime lacks WebCrypto Ed25519');
        }
        return { kind: 'owner_identity_changed' };
    }
    for (const copy of envelope.copies) {
        if (!(await verifier.verify(copy))) {
            return { kind: 'invalid_signature', recipientAccountId: copy.recipientAccountId };
        }
    }

    // The signatures awaited; from here to the write nothing yields, so what
    // is checked now is what is written against (on one replica): the id is
    // still free, so two arms with one id cannot both write, and every bound
    // still has room, so a burst of arms that all passed the checks above
    // against the same counts is let through one at a time until the bound.
    // An arm this process is still writing counts (`armsInFlight`), since in
    // Postgres the write below awaits the database.
    if (db.getDeadmanSwitch(envelope.releaseId) || armsInFlight.has(envelope.releaseId)) {
        return { kind: 'id_taken' };
    }
    const boundsAgain = ownerBoundsRefusal(input.ownerId, now);
    if (boundsAgain) return boundsAgain;
    for (const recipientAccountId of recipients) {
        if (!recipientHasRoom(input.ownerId, recipientAccountId)) {
            return { kind: 'recipient_limit', recipientAccountId };
        }
    }
    const identitiesAgain = identitiesStillCurrent(input.ownerId, owner.recordId, envelope.copies);
    if (identitiesAgain) return identitiesAgain;
    if (ownerAccountGone(input.ownerId)) return { kind: 'no_account' };
    const lastCheckInAt = now.toISOString();
    const { triggerAt, releaseAt } = computeDeadlines({
        lastCheckInAt,
        checkInIntervalSeconds: input.input.checkInIntervalSeconds,
        gracePeriodSeconds: input.input.gracePeriodSeconds,
    });
    // One store call writes the copies first (over any row of the same key)
    // and the switch last, insert-only (`armDeadmanSwitch`): in Postgres on
    // one connection, awaited, so the switch is in the database before the
    // owner is answered; a stop between the rows, a failed arm or one that
    // finds the id taken leaves copies that no switch names (listed and
    // served by nothing; nothing deletes them, since another process's switch
    // for the same envelope may rely on them: round 12 of part 2's review)
    // and never a switch without its copies, which would fire and release to
    // nobody; and a write that fails arms nothing the store lists unless the
    // switch is found in the database afterwards (round 11: the owner was
    // answered 201 before the write-behind upsert ran, and a dropped one left
    // a switch only that process listed, which in the deployed layout never
    // fired). Until the store answers, the arm counts toward every bound,
    // and the owner's deletion waits for it.
    let settle!: () => void;
    armsInFlight.set(envelope.releaseId, {
        ownerId: input.ownerId,
        recipients,
        armedAt: now.getTime(),
        done: new Promise<void>((resolve) => {
            settle = resolve;
        }),
    });
    let outcome: Awaited<ReturnType<typeof db.armDeadmanSwitch>>;
    try {
        outcome = await db.armDeadmanSwitch(
            {
                id: envelope.releaseId,
                ownerId: input.ownerId,
                // No room: the property is left off, so the Postgres row's room_id is NULL.
                status: 'armed',
                checkInIntervalSeconds: input.input.checkInIntervalSeconds,
                gracePeriodSeconds: input.input.gracePeriodSeconds,
                lastCheckInAt,
                triggerAt,
                releaseAt,
                recipients,
                encryptedPayload: encodeStoredRelease({ header, ownerIdentity: owner.identity }),
                ...(input.input.label === undefined ? {} : { headline: input.input.label }),
                releaseFormat: DEADMAN_RELEASE_FORMAT,
            },
            envelope.copies.map((copy) => ({
                switchId: envelope.releaseId,
                recipientAccountId: copy.recipientAccountId,
                recipientFingerprint: copy.recipientFingerprint,
                sealedKey: copy.sealedKey,
                signature: copy.signature,
            }))
        );
        // The owner's deletion may have run while the rows were written: it
        // waits for this arm, but the switch is this arm's to take back, so
        // that the owner's other session is not answered 201 for a switch of
        // an account that is gone.
        if (outcome.kind === 'armed' && ownerAccountGone(input.ownerId)) {
            await db.eraseDeadmanSwitchUnlessFired(envelope.releaseId);
            return { kind: 'no_account' };
        }
    } finally {
        armsInFlight.delete(envelope.releaseId);
        settle();
    }
    switch (outcome.kind) {
        case 'armed':
            return { kind: 'armed', record: outcome.record, envelope };
        case 'id_taken':
            return { kind: 'id_taken' };
        case 'unanswered':
            return { kind: 'write_unanswered' };
        case 'failed':
            return { kind: 'write_failed' };
    }
};

/** For tests: how many arms this process is writing at the moment. */
export const armsInFlightCount = (): number => armsInFlight.size;

export type ResealReleaseOutcome =
    | { kind: 'resealed'; record: DeadmanSwitchRecord; copy: ReleaseCopy }
    /** An id that names no switch, or someone else's: one answer outside. */
    | { kind: 'not_found' }
    | { kind: 'switch_triggered' }
    | { kind: 'switch_cancelled' }
    | { kind: 'not_a_release' }
    | { kind: 'invalid_copy'; problem: ReleaseEnvelopeProblem }
    | { kind: 'not_a_recipient'; recipientAccountId: string }
    | OwnerIdentityRefusal
    | OwnerAccountRefusal
    | RecipientRefusal
    | { kind: 'invalid_signature'; recipientAccountId: string };

/**
 * Replace one recipient's copy on an owner's release switch that has not
 * fired or been cancelled (§8, "on re-sealing"): the copy is for one of the
 * switch's recipients, names that account's current identity, and its
 * signature verifies over the stored header under the owner's identity named
 * there, which must still be the owner's current one (otherwise the owner
 * arms again, E14). After the signature awaited, the switch is read again (a
 * cancel meanwhile wins), and so are the owner's and the recipient's current
 * identities, as on arming: without that a recipient who rotated during the
 * verification got a copy sealed to the key they had just replaced, and one
 * whose account deletion ran meanwhile, which blanks every copy sealed to the
 * account and erases its identities, got a fresh held copy written after
 * the blanking pass (round 4 of part 2's review). On one API process; across
 * replicas the mirror is eventually consistent (§15).
 */
export const resealReleaseCopy = async (input: {
    ownerId: string;
    switchId: string;
    copy: unknown;
}): Promise<ResealReleaseOutcome> => {
    const readSwitch = ():
        | { ok: true; record: DeadmanSwitchRecord; release: StoredRelease }
        | { ok: false; outcome: ResealReleaseOutcome } => {
        const record = db.getDeadmanSwitch(input.switchId);
        if (!record || record.ownerId !== input.ownerId) {
            return { ok: false, outcome: { kind: 'not_found' } };
        }
        if (record.status === 'triggered')
            return { ok: false, outcome: { kind: 'switch_triggered' } };
        if (record.status === 'cancelled')
            return { ok: false, outcome: { kind: 'switch_cancelled' } };
        const release = storedRelease(record);
        if (!release) return { ok: false, outcome: { kind: 'not_a_release' } };
        return { ok: true, record, release };
    };
    const first = readSwitch();
    if (!first.ok) return first.outcome;

    const parsed = parseReleaseCopy(input.copy);
    if (!parsed.ok) return { kind: 'invalid_copy', problem: parsed.problem };
    const copy = parsed.value;
    if (
        copy.recipientAccountId === input.ownerId ||
        !first.record.recipients.includes(copy.recipientAccountId)
    ) {
        return { kind: 'not_a_recipient', recipientAccountId: copy.recipientAccountId };
    }
    if (ownerAccountGone(input.ownerId)) return { kind: 'no_account' };
    const owner = currentOwnerIdentity(input.ownerId);
    if (!owner.ok) return owner.refusal;
    const state = recipientIdentityState(copy.recipientAccountId, copy.recipientFingerprint);
    if (state !== 'current') return refuseRecipient(state, copy.recipientAccountId);

    // Under the owner's current identity: a header signed by a replaced one
    // is refused here (owner_identity_changed), and the owner arms again.
    const verifier = await releaseSignatureVerifier(first.release.header, owner.identity);
    if (!verifier.ok) {
        if (verifier.problem === 'unsupported') {
            throw new Error('dead-man releases: this runtime lacks WebCrypto Ed25519');
        }
        return { kind: 'owner_identity_changed' };
    }
    if (!(await verifier.verify(copy))) {
        return { kind: 'invalid_signature', recipientAccountId: copy.recipientAccountId };
    }

    const again = readSwitch();
    if (!again.ok) return again.outcome;
    const identitiesAgain = identitiesStillCurrent(input.ownerId, owner.recordId, [copy]);
    if (identitiesAgain) return identitiesAgain;
    if (ownerAccountGone(input.ownerId)) return { kind: 'no_account' };
    db.putDeadmanReleaseWrap({
        switchId: again.record.id,
        recipientAccountId: copy.recipientAccountId,
        recipientFingerprint: copy.recipientFingerprint,
        sealedKey: copy.sealedKey,
        signature: copy.signature,
    });
    return { kind: 'resealed', record: again.record, copy };
};

const copyOf = (wrap: DeadmanReleaseWrapRecord): ReleaseCopy => ({
    recipientAccountId: wrap.recipientAccountId,
    recipientFingerprint: wrap.recipientFingerprint,
    sealedKey: wrap.sealedKey,
    signature: wrap.signature,
});

/** How one release's notices stand, for its owner. */
export const noticeCounts = (switchId: string): DeadmanNoticeCounts => {
    const counts: DeadmanNoticeCounts = { total: 0, sent: 0, pending: 0, failed: 0 };
    for (const notice of db.listDeadmanReleaseNotices(switchId)) {
        counts.total += 1;
        counts[notice.status] += 1;
    }
    return counts;
};

/**
 * What the owner's view adds for a release switch: the release while its
 * content and the owner's own copy are held (cancel, deletion and the
 * removal after 365 days take them), whom each held copy is sealed to, and,
 * once it fired, the notice counts. Never the notice rooms.
 */
export const ownerReleaseView = (
    record: DeadmanSwitchRecord
): { release?: DeadmanOwnerRelease; notices?: DeadmanNoticeCounts } => {
    if (!isReleaseSwitch(record)) return {};
    const view: { release?: DeadmanOwnerRelease; notices?: DeadmanNoticeCounts } = {};
    const release = storedRelease(record);
    const wraps = db.listDeadmanReleaseWraps(record.id).filter(wrapIsHeld);
    const own = wraps.find((wrap) => wrap.recipientAccountId === record.ownerId);
    if (release && own) {
        view.release = {
            header: release.header,
            ownerIdentity: release.ownerIdentity,
            ownCopy: copyOf(own),
            sealedTo: wraps
                .filter((wrap) => wrap.recipientAccountId !== record.ownerId)
                .map((wrap) => ({
                    recipientAccountId: wrap.recipientAccountId,
                    recipientFingerprint: wrap.recipientFingerprint,
                })),
        };
    }
    if (record.status === 'triggered') view.notices = noticeCounts(record.id);
    return view;
};

/**
 * A release switch that fired and stands fired: `triggered` with the time it
 * fired. `releasedAt` is written with the trigger, and until round 12 of part
 * 2's review the owner's deletion over a trigger another process committed
 * left the switch `cancelled` with `releasedAt` still set (since then the
 * deletion is decided in Postgres and erases such a switch as fired, decision
 * 30, so nothing writes that shape any more), so the status is checked too
 * (round 11: the readers keyed on `releasedAt` alone, and only the emptied
 * content kept such a switch from being served); a row of that shape written
 * before is served to nobody.
 */
export const standsFired = (
    record: DeadmanSwitchRecord
): record is DeadmanSwitchRecord & { releasedAt: string } =>
    record.status === 'triggered' && typeof record.releasedAt === 'string';

/**
 * The releases given to `accountId` (`GET /v1/deadman/releases`): fired
 * release switches that sealed a copy to them, each with their own copy and
 * nothing of anyone else's. Nothing before the trigger, nothing of a switch
 * they own, nothing of one cancelled with its `releasedAt` kept (which the
 * owner's deletion over a trigger committed elsewhere left until round 12),
 * nothing once the content was removed, nothing of a switch whose owner's
 * deletion has queued an erase this process has not seen land, newest
 * release first.
 */
export const releasedCopiesFor = (accountId: string): DeadmanReleasedCopy[] => {
    const releases: DeadmanReleasedCopy[] = [];
    for (const wrap of db.listDeadmanReleaseWrapsForRecipient(accountId)) {
        if (!wrapIsHeld(wrap)) continue;
        const record = db.getDeadmanSwitch(wrap.switchId);
        if (!record || !standsFired(record) || record.ownerId === accountId) continue;
        // Its owner's deletion has queued an erase not yet landed: this
        // process's view is not Postgres's, so nothing is served from it
        // until it lands (round 13 of part 2's review).
        if (db.deadmanSwitchErasePending(record.id)) continue;
        const release = storedRelease(record);
        if (!release) continue;
        releases.push({
            releaseId: record.id,
            ownerAccountId: record.ownerId,
            releasedAt: record.releasedAt,
            removesAt: removesAt(record.releasedAt),
            header: release.header,
            ownerIdentity: release.ownerIdentity,
            copy: copyOf(wrap),
        });
    }
    return releases.sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
};

/**
 * Write the notice owed to each recipient whose copy is still held, due at
 * `dueAt`. One per recipient per release: a row that exists is left alone,
 * so the sweep and the notifier's catch-up can both call this. Returns how
 * many were written.
 */
export const writeReleaseNotices = (record: DeadmanSwitchRecord, dueAt: string): number => {
    let written = 0;
    for (const wrap of db.listDeadmanReleaseWraps(record.id)) {
        if (wrap.recipientAccountId === record.ownerId || !wrapIsHeld(wrap)) continue;
        const created = db.createDeadmanReleaseNotice({
            switchId: record.id,
            recipientAccountId: wrap.recipientAccountId,
            nextAttemptAt: dueAt,
        });
        if (created) written += 1;
    }
    return written;
};

/**
 * The sweep's trigger of a release switch: the status, when it fired, and
 * the notice rows, in that order. From the status change on, each
 * recipient's read lists their copy; the notifier sends the notices. The
 * trigger is conditional (`advanceDeadmanSwitch`, in Postgres too): a switch
 * another process already fired, or changed since this process read it, is
 * not fired again, keeps its first `releasedAt`, and gets no rows from here
 * (round 9 of part 2's review). In Postgres the status change reaches this
 * process's mirror, and so the reads and the notifier, only once Postgres has
 * applied it (round 10).
 */
export const recordReleaseTrigger = async (
    record: DeadmanSwitchRecord,
    now: Date
): Promise<DeadmanSwitchRecord | undefined> => {
    const releasedAt = now.toISOString();
    const updated = await db.advanceDeadmanSwitch(record.id, record, {
        status: 'triggered',
        releasedAt,
    });
    if (!updated) return undefined;
    writeReleaseNotices(updated, releasedAt);
    return updated;
};

/** Blank every held copy of one switch (cancel, the owner's deletion, removal). Returns how many. */
export const blankReleaseWraps = (switchId: string): number => {
    let blanked = 0;
    for (const wrap of db.listDeadmanReleaseWraps(switchId)) {
        if (!wrapIsHeld(wrap)) continue;
        if (db.eraseDeadmanReleaseWrap(wrap.switchId, wrap.recipientAccountId)) blanked += 1;
    }
    return blanked;
};

/**
 * Remove the content, the owner's identity copy and every sealed copy of
 * each release switch that fired `DEADMAN_RELEASE_RETENTION_DAYS` or more
 * ago and stands fired (§11, retention). The rows stay: the switch as a
 * record of what it was and when it fired, the copies as a record of whom
 * it was for, the notices as a record that one was sent. The content's
 * removal is a conditional write of that one column
 * (`updateDeadmanSwitchIf`, on the switch as read: fired, with its last
 * check-in), so in Postgres it touches nothing else of the row (round 11 of
 * part 2's review: as a full-row write from the worker's mirror it could put
 * back a label the owner's deletion on the API process had just erased); one
 * the database refuses or does not answer is left for the next pass.
 *
 * Each pass also blanks the held copies of any cancelled release switch
 * (round 11: a cancel the database applied after its bound had passed, or a
 * re-seal that reached a replica after its cancel, left copies held on a
 * cancelled switch, served to nobody, until the owner cancelled again, which
 * nothing told them to), conditional in the store on the switch it holds
 * being cancelled (`blankCopiesOfCancelledSwitch`; round 13: plain writes
 * from this process's view, which the owner's queued erase had made
 * cancelled, blanked every copy of a release that had fired elsewhere).
 * Those count as removed too. A switch whose owner's deletion has queued an
 * erase this process has not seen land is left alone. Returns how many
 * releases were removed this pass.
 */
export const removeExpiredReleases = async (now: Date): Promise<number> => {
    let removed = 0;
    const nowMs = now.getTime();
    for (const listed of db.listAllDeadmanSwitches()) {
        const record = db.getDeadmanSwitch(listed.id);
        if (!record || !isReleaseSwitch(record)) continue;
        if (db.deadmanSwitchErasePending(record.id)) continue;
        if (record.status === 'cancelled') {
            if ((await db.blankCopiesOfCancelledSwitch(record.id)) > 0) removed += 1;
            continue;
        }
        if (!standsFired(record)) continue;
        if (Date.parse(record.releasedAt) + DEADMAN_RELEASE_RETENTION_MS > nowMs) continue;
        const held = record.encryptedPayload !== '';
        const blanked = blankReleaseWraps(record.id);
        if (held) {
            const outcome = await db.updateDeadmanSwitchIf(record.id, record, {
                encryptedPayload: '',
            });
            if (outcome.kind !== 'applied') continue;
        }
        if (held || blanked > 0) removed += 1;
    }
    return removed;
};
