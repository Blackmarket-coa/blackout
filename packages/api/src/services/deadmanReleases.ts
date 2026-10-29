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
 * nowhere until PR 4; the flag gates arming only, so a switch armed while it
 * was on keeps firing, being served and being notified if it is turned off
 * (a flag that could hold a release back would be one more way to do it).
 */
import {
    DEADMAN_LABEL_MAX_LENGTH,
    DEADMAN_MAX_LIVE_RELEASE_SWITCHES,
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

/** Whether this deployment arms release switches: `BLACKOUT_DEADMAN_RELEASES`, read per request. */
export const releasesEnabled = (): boolean => {
    const value = (process.env.BLACKOUT_DEADMAN_RELEASES ?? '').trim().toLowerCase();
    return value === '1' || value === 'true';
};

/** A switch armed in the release format; everything else is `legacy`, rows from before 106 included. */
export const isReleaseSwitch = (record: DeadmanSwitchRecord): boolean =>
    record.releaseFormat === DEADMAN_RELEASE_FORMAT;

/** A copy the store still holds: cancel, deletion and removal blank both fields. */
export const wrapIsHeld = (wrap: DeadmanReleaseWrapRecord): boolean =>
    wrap.sealedKey !== '' && wrap.signature !== '';

/** When the API removes a release's content and copies: 365 days after it fired. */
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

/** The bounds the arming form shows, and whether arming is open here. */
export const releaseLimits = (sweep: { backlogToleranceMs: number }): DeadmanLimits => ({
    armingAvailable: releasesEnabled(),
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
    backlogToleranceSeconds: Math.round(sweep.backlogToleranceMs / 1000),
    backlogGraceSeconds: DEADMAN_BACKLOG_GRACE_SECONDS,
    releaseRetentionDays: DEADMAN_RELEASE_RETENTION_DAYS,
    noticeRetryDays: DEADMAN_NOTICE_RETRY_DAYS,
});

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

/** Live (armed or in grace) release switches one account has. */
export const liveReleaseSwitchCount = (ownerId: string): number =>
    db
        .listDeadmanSwitchesForOwner(ownerId)
        .filter(
            (record) =>
                isReleaseSwitch(record) && (record.status === 'armed' || record.status === 'grace')
        ).length;

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

/**
 * The owner's current identity in the directory. Whether it is the one the
 * header names is the verifier's to say: `releaseSignatureVerifier` computes
 * the identity's fingerprint and refuses a header with another
 * (`owner_identity`, answered as `owner_identity_changed`), so no comparison
 * is made here that it would make again.
 */
const currentOwnerIdentity = (
    ownerId: string
): { ok: true; identity: ReleaseIdentity } | { ok: false; refusal: OwnerIdentityRefusal } => {
    const current = db.getCurrentReleaseIdentity(ownerId);
    if (!current) return { ok: false, refusal: { kind: 'owner_identity_missing' } };
    return { ok: true, identity: recordToReleaseIdentity(current) };
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
    | { kind: 'live_limit' }
    | { kind: 'id_taken' }
    | OwnerIdentityRefusal
    | RecipientRefusal
    | { kind: 'invalid_signature'; recipientAccountId: string };

/**
 * Arm a release switch for `ownerId` (§8, "the API, on arming"), in this
 * order: the envelope's form; the caller is its owner; the timer and label
 * are in bounds; the owner has room for one more live release switch; the
 * owner has a current identity; every other copy names an account here
 * whose current identity is the copy's (an account without an identity, a
 * replaced identity and one never published each have their own answer);
 * every signature verifies under the owner's identity, which also refuses a
 * header naming another identity than the owner's current one; and, after
 * the signatures awaited, the release id is still free. The writes follow
 * with no await between. The cap is checked once, before the signatures: a
 * race between two arms can exceed it by one, and it bounds storage only.
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

    const timerProblem = validateReleaseTimer(input.input);
    if (timerProblem) return { kind: 'invalid', message: timerProblem };
    if (liveReleaseSwitchCount(input.ownerId) >= DEADMAN_MAX_LIVE_RELEASE_SWITCHES) {
        return { kind: 'live_limit' };
    }
    const owner = currentOwnerIdentity(input.ownerId);
    if (!owner.ok) return owner.refusal;

    const recipients: string[] = [];
    for (const copy of envelope.copies) {
        if (copy.recipientAccountId === input.ownerId) continue;
        const state = recipientIdentityState(copy.recipientAccountId, copy.recipientFingerprint);
        if (state !== 'current') return refuseRecipient(state, copy.recipientAccountId);
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

    // The signatures awaited; the id is checked now and the rows written at
    // once, so two arms with one id cannot both write.
    if (db.getDeadmanSwitch(envelope.releaseId)) return { kind: 'id_taken' };
    const now = input.now ?? new Date();
    const lastCheckInAt = now.toISOString();
    const { triggerAt, releaseAt } = computeDeadlines({
        lastCheckInAt,
        checkInIntervalSeconds: input.input.checkInIntervalSeconds,
        gracePeriodSeconds: input.input.gracePeriodSeconds,
    });
    const record = db.createDeadmanSwitch({
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
    });
    for (const copy of envelope.copies) {
        db.putDeadmanReleaseWrap({
            switchId: record.id,
            recipientAccountId: copy.recipientAccountId,
            recipientFingerprint: copy.recipientFingerprint,
            sealedKey: copy.sealedKey,
            signature: copy.signature,
        });
    }
    return { kind: 'armed', record, envelope };
};

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
    | RecipientRefusal
    | { kind: 'invalid_signature'; recipientAccountId: string };

/**
 * Replace one recipient's copy on an owner's release switch that has not
 * fired or been cancelled (§8, "on re-sealing"): the copy is for one of the
 * switch's recipients, names that account's current identity, and its
 * signature verifies over the stored header under the owner's identity named
 * there, which must still be the owner's current one (otherwise the owner
 * arms again, E14). The switch is read again after the signature awaited.
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
 * The releases given to `accountId` (`GET /v1/deadman/releases`): fired
 * release switches that sealed a copy to them, each with their own copy and
 * nothing of anyone else's. Nothing before the trigger, nothing of a switch
 * they own, nothing once the content was removed, newest release first.
 */
export const releasedCopiesFor = (accountId: string): DeadmanReleasedCopy[] => {
    const releases: DeadmanReleasedCopy[] = [];
    for (const wrap of db.listDeadmanReleaseWrapsForRecipient(accountId)) {
        if (!wrapIsHeld(wrap)) continue;
        const record = db.getDeadmanSwitch(wrap.switchId);
        // `releasedAt` is written with the trigger and only then: it is what
        // says a release switch fired.
        if (!record || !record.releasedAt || record.ownerId === accountId) continue;
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
 * recipient's read lists their copy; the notifier sends the notices.
 */
export const recordReleaseTrigger = (
    record: DeadmanSwitchRecord,
    now: Date
): DeadmanSwitchRecord | undefined => {
    const releasedAt = now.toISOString();
    const updated = db.updateDeadmanSwitch(record.id, { status: 'triggered', releasedAt });
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
 * ago (§11, retention). The rows stay: the switch as a record of what it
 * was and when it fired, the copies as a record of whom it was for, the
 * notices as a record that one was sent. Returns how many releases were
 * removed this pass.
 */
export const removeExpiredReleases = (now: Date): number => {
    let removed = 0;
    const nowMs = now.getTime();
    for (const record of db.listAllDeadmanSwitches()) {
        // Only a release switch that fired has `releasedAt`.
        if (!record.releasedAt) continue;
        if (Date.parse(record.releasedAt) + DEADMAN_RELEASE_RETENTION_MS > nowMs) continue;
        const held = record.encryptedPayload !== '';
        const blanked = blankReleaseWraps(record.id);
        if (held) db.updateDeadmanSwitch(record.id, { encryptedPayload: '' });
        if (held || blanked > 0) removed += 1;
    }
    return removed;
};
