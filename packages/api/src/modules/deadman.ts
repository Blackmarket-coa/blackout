import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
    DEADMAN_EVENT_NAMES,
    DEADMAN_MAX_ARMS_PER_DAY,
    DEADMAN_RELEASE_ERRORS,
    DEADMAN_RELEASE_FORMAT,
    type DeadmanReleasedSwitch,
    type DeadmanSwitchPayload,
} from '@blackout/protocol';
import { db } from '../db/store';
import type { DeadmanSwitchRecord } from '../db/types';
import { jsonBodyLimit } from '../middleware/body-limit';
import { readJsonBody } from '../middleware/validate';
import { BACKLOG_TOLERANCE_FLOOR_MS, backlogToleranceMs } from '../services/backlogTolerance';
import {
    armReleaseSwitch,
    armingAvailability,
    blankReleaseWraps,
    isReleaseSwitch,
    ownerReleaseView,
    recordReleaseTrigger,
    releaseLimits,
    releasedCopiesFor,
    removeExpiredReleases,
    resealReleaseCopy,
    type ArmReleaseOutcome,
    type ResealReleaseOutcome,
} from '../services/deadmanReleases';
import { deadmanSweepIntervalMs } from '../services/deadmanSweepScheduler';
import { log } from '../telemetry/logger';
import { requireAuthenticatedUser, requireDomainCapability } from './authz';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { applyCheckIn, evaluateSweepTransition, sweepDueAtMs } from '../services/deadmanScheduler';
import type { FeatureModule } from './types';

/**
 * Why `POST /switches` refuses every arm while `BLACKOUT_DEADMAN_RELEASES` is
 * off, which it is unless an operator turns it on
 * (`docs/security/deadman-release-design-2026-10-24.md` §8, PR 4). With it
 * off the server does not take releases, and a legacy arm would only store
 * something it cannot release to anyone: triggering changes a status, and
 * nobody is told. So the only honest answer is this one, given before the
 * body is parsed so that nothing about the request is stored. The 1 MiB body
 * cap is middleware and runs first, flag off or on: a body over it is
 * answered 413 whatever the flag says, and a body under it is buffered and
 * then, with the flag off, answered 409 unread. With it on, the route takes
 * the release format only (`services/deadmanReleases.ts`).
 *
 * The same 409 is given, with its own reason and message, where this
 * process's environment runs no sweep (`BLACKOUT_DEADMAN_SWEEP=0`,
 * `armingAvailability`): a switch armed there would never fire.
 */
export const ARMING_UNAVAILABLE = {
    code: DEADMAN_RELEASE_ERRORS.armingUnavailable,
    reason: 'releases_off',
    message:
        'Arming is not available: Blackout cannot release a message to anyone yet. ' +
        'Existing switches can be checked in and cancelled.',
} as const;

export const ARMING_UNAVAILABLE_NO_SWEEP = {
    code: DEADMAN_RELEASE_ERRORS.armingUnavailable,
    reason: 'sweep_off',
    message:
        'Arming is not available: this deployment runs no dead-man sweep, so a switch ' +
        'armed here would never fire. Existing switches can be checked in and cancelled.',
} as const;

/**
 * An arming body: the envelope's own validator checks the envelope, so the
 * schema holds only the shape around it. The largest envelope (65 copies, a
 * 256 KiB message) is about 480 KB of JSON; a re-seal is one copy.
 */
export const RELEASE_ARM_MAX_BODY_BYTES = 1024 * 1024;
export const RELEASE_RESEAL_MAX_BODY_BYTES = 64 * 1024;

const armSchema = z.strictObject({
    format: z.literal(DEADMAN_RELEASE_FORMAT),
    checkInIntervalSeconds: z.number().int(),
    gracePeriodSeconds: z.number().int(),
    label: z.string().optional(),
    envelope: z.record(z.string(), z.unknown()),
});

const resealSchema = z.strictObject({ copy: z.record(z.string(), z.unknown()) });

/**
 * The one answer for a switch the caller may not act on: an id that names no
 * switch, someone else's switch, and a recipient's switch before it has
 * triggered all get this same status and body. A 403 for "exists, not yours"
 * next to a 404 for "does not exist" would let anyone holding an id learn
 * whether a switch exists, and let a recipient follow one before release.
 *
 * One route does say whether an id exists: arming answers 409
 * `release_id_taken` for any switch's id, anyone's, in any status, since the
 * release id is the switch id and two switches cannot share one. Accepted
 * (independent review of part 2, P3b-L7): ids are UUID v4, so none is found by
 * guessing; rows are never deleted, so existence is constant once an id is
 * known; the only ways to know one are to own the switch or to have been told
 * it, which a recipient is after the trigger; the probe costs a fully signed
 * envelope under the caller's current identity and is under the global
 * limiter; and the status is not revealed. Scoping the 409 to the caller's own
 * ids would turn a real cross-owner collision into an opaque failure for no
 * privacy gain.
 */
const SWITCH_NOT_FOUND = { code: 'switch_not_found', message: 'Switch not found' } as const;

const notFound = (c: Context) => c.json(SWITCH_NOT_FOUND, 404);

/**
 * How many times a check-in or a cancel is tried against a switch another
 * write changed between this process's read and its own (another check-in,
 * the sweep's move into grace) before the route gives up.
 */
const SWITCH_WRITE_ATTEMPTS = 3;

/** The switch kept changing under a check-in or a cancel: nothing was written. */
const switchChanged = (c: Context) =>
    c.json(
        {
            code: 'switch_changed',
            message: 'The switch changed while this was being written. Read it and try again.',
        },
        409
    );

/**
 * The database did not answer a check-in, a cancel or an arm in time
 * (`updateDeadmanSwitchIf`, `armDeadmanSwitch`): one that was sent may or may
 * not have been recorded, and nothing of it is in this process's memory until
 * it is; one refused at once because another switch statement already stood
 * unanswered was not sent, so it was not recorded. Doing a check-in or a
 * cancel again is safe, since each is conditional on the switch as it is
 * read; an arm done again with the same envelope is refused
 * `release_id_taken` if the first landed after all, and the switch is then
 * in the owner's list. Also an arm whose statement failed and whose switch
 * could not be read afterwards either.
 */
const switchWriteUnanswered = (c: Context, what: 'check-in' | 'cancel' | 'arm') =>
    c.json(
        {
            code: 'switch_write_unanswered',
            message: `The server could not confirm the ${what} in time. It may not have been recorded; try again.`,
        },
        503
    );

/**
 * The arm's statement failed, and the switch read again afterwards was not
 * there: nothing is armed (a statement the database was still running when
 * its client was lost can commit after that read; the next arm of the same
 * envelope then finds it and answers `release_id_taken`, with the switch in
 * the owner's list).
 */
const switchWriteFailed = (c: Context) =>
    c.json(
        {
            code: 'switch_write_failed',
            message: 'The server could not record the switch and finds nothing armed; try again.',
        },
        500
    );

/**
 * The switch as its owner sees it. A legacy switch's `encryptedPayload` is
 * present while the store still holds one: cancel clears it (as account
 * deletion does for a switch that has not fired), so a cancelled switch's
 * view carries none. A release switch carries its release instead, while
 * held, and its notice counts once it fired (`ownerReleaseView`); what it
 * keeps in the payload column is never sent as a payload. Only the owner
 * gets this view; a recipient of a legacy switch gets
 * `recordToReleasedSwitch` after the trigger, a recipient of a release
 * switch `GET /releases`.
 */
export const recordToOwnerView = (record: DeadmanSwitchRecord): DeadmanSwitchPayload => {
    const payload: DeadmanSwitchPayload = {
        switchId: record.id,
        ownerId: record.ownerId,
        roomId: record.roomId ?? null,
        status: record.status,
        checkInIntervalSeconds: record.checkInIntervalSeconds,
        gracePeriodSeconds: record.gracePeriodSeconds,
        lastCheckInAt: record.lastCheckInAt,
        triggerAt: record.triggerAt,
        releaseAt: record.releaseAt,
        recipients: record.recipients,
        headline: record.headline,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        releaseFormat: record.releaseFormat ?? 'legacy',
    };
    if (isReleaseSwitch(record)) {
        if (record.releasedAt) payload.releasedAt = record.releasedAt;
        const { release, notices } = ownerReleaseView(record);
        if (release) payload.release = release;
        if (notices) payload.notices = notices;
        return payload;
    }
    if (record.encryptedPayload) {
        payload.encryptedPayload = record.encryptedPayload;
    }
    return payload;
};

/**
 * A legacy switch as a recipient sees it, once it has triggered: the payload
 * and enough to say whose it is and when it was due. No check-in history, no
 * interval, no room, no label, no other recipients. Callers must check the
 * status and the format first; this never looks at either. A release switch
 * is never given this way: its recipients read `GET /releases`.
 */
export const recordToReleasedSwitch = (record: DeadmanSwitchRecord): DeadmanReleasedSwitch => ({
    switchId: record.id,
    ownerId: record.ownerId,
    status: 'triggered',
    releaseAt: record.releaseAt,
    encryptedPayload: record.encryptedPayload,
});

// Envelopes are only ever returned to the owner (every route that builds one
// checks ownership first), so they carry the owner's view.
const envelope = (event: string, record: DeadmanSwitchRecord, senderId: string) => ({
    event,
    roomId: record.roomId ?? null,
    senderId,
    occurredAt: new Date().toISOString(),
    payload: recordToOwnerView(record),
});

/** The switch, if `subject` owns it; otherwise nothing, whether or not it exists. */
const ownedSwitch = (id: string, subject: string): DeadmanSwitchRecord | undefined => {
    const existing = db.getDeadmanSwitch(id);
    return existing && existing.ownerId === subject ? existing : undefined;
};

/**
 * Autonomous server-side sweep of EVERY armed switch against the wall clock,
 * driving overdue ones into grace/triggered and emitting the domain event.
 *
 * This is the load-bearing half of a dead-man's switch: it runs from the
 * background loop with no user present, so a switch fires exactly when its
 * owner has gone dark, which is the entire point of the feature. It is the
 * only code path that moves a switch forward; the owner-scoped
 * `POST /process-overdue` route that also did, against a clock the caller
 * supplied, was removed (D6). `evaluateSweepTransition` is idempotent for
 * already triggered/cancelled switches, so repeated ticks never re-emit.
 * Returns the number of switches whose status advanced this pass, backlog
 * windows included.
 *
 * A switch the sweep reaches more than `toleranceMs` after it should have acted
 * (the sweep was not running) gets one 72-hour backlog grace window instead of
 * firing: see `evaluateSweepTransition`.
 *
 * A release switch that fires also records when, and gets one notice row per
 * recipient whose copy is held (`recordReleaseTrigger`); the notifier sends
 * them. A legacy switch changes status only, as before. Each pass also
 * removes the content and copies of releases that fired 365 days ago or more
 * (`removeExpiredReleases`); those are not counted as processed.
 *
 * Every move is conditional (`advanceDeadmanSwitch`): it lands only on a
 * switch still as this pass read it, with the same status and last check-in
 * (a fired switch is `triggered`), in Postgres too, so a standby whose mirror has not yet heard
 * of a trigger, a check-in or a cancel another process committed does not
 * write over it, and a switch it does not move gets nothing else written and
 * no event (round 9 of part 2's review). The mirror takes a move only once
 * Postgres has applied it, so nothing here serves, notifies or reports a
 * trigger Postgres then refuses, and a move whose statement fails or does not
 * answer in time is left for the first pass after the database answers
 * (round 10). Each switch is read from the mirror as it is reached, since a
 * move in Postgres awaits the database.
 *
 * A stall of the database's statements is an outage of this sweep for the
 * switches it kept from moving, and of every owner's check-in on this
 * process: a switch due at any moment while they stood (the store keeps
 * when they began and settled), or whose owner's check-in or cancel was
 * refused unanswered here and has not checked in since, gets the backlog
 * window instead of firing, within the tolerance or not, as after an outage
 * of the sweep's own (round 11 of part 2's review: a stall an hour before a
 * deadline refused the owner's check-in, and the first pass after it fired
 * the switch). The sweep in another process knows only its own stalls.
 */
export async function sweepOverdueDeadmanSwitches(
    now: Date = new Date(),
    toleranceMs: number = BACKLOG_TOLERANCE_FLOOR_MS
): Promise<number> {
    let processed = 0;
    let backlogWindows = 0;
    for (const listed of db.listAllDeadmanSwitches()) {
        const record = db.getDeadmanSwitch(listed.id);
        if (!record) continue;
        if (record.status === 'triggered' || record.status === 'cancelled') {
            db.clearOwnerWriteUnanswered(record.id);
            continue;
        }
        let refused = db.ownerWriteUnansweredAt(record.id);
        if (refused && refused.lastCheckInAt !== record.lastCheckInAt) {
            // A check-in landed since, here or elsewhere: the refusal is moot.
            db.clearOwnerWriteUnanswered(record.id);
            refused = undefined;
        }
        const stalled =
            refused !== undefined ||
            db.switchStatementsStalledBetween(sweepDueAtMs(record), now.getTime());
        const transition = evaluateSweepTransition(record, now, toleranceMs, { stalled });
        if (transition.kind === 'none') continue;

        let updated: DeadmanSwitchRecord | undefined;
        if (transition.kind === 'backlog_grace') {
            updated = await db.advanceDeadmanSwitch(record.id, record, {
                status: transition.record.status,
                releaseAt: transition.record.releaseAt,
                backlogGraceStartedAt: transition.record.backlogGraceStartedAt,
            });
        } else if (transition.kind === 'triggered' && isReleaseSwitch(record)) {
            updated = await recordReleaseTrigger(record, now);
        } else {
            updated = await db.advanceDeadmanSwitch(record.id, record, {
                status: transition.record.status,
            });
        }
        if (!updated) continue;

        emitDomainEvent({
            module: 'deadman',
            type:
                transition.kind === 'triggered'
                    ? 'deadman.switch.triggered'
                    : 'deadman.switch.grace',
            payload: {
                switchId: updated.id,
                ownerId: updated.ownerId,
                roomId: updated.roomId ?? null,
                recipients: updated.recipients,
                ...(transition.kind === 'backlog_grace'
                    ? { backlogWindow: true, releaseAt: updated.releaseAt }
                    : {}),
            },
        });
        processed += 1;
        if (transition.kind === 'backlog_grace') backlogWindows += 1;
    }
    if (backlogWindows > 0) {
        // Counts only, like the rest of the sweep's logging.
        log.warn('deadman_backlog_grace_windows_started', {
            switches: backlogWindows,
            toleranceMs,
        });
    }
    const removed = await removeExpiredReleases(now);
    if (removed > 0) log.info('deadman_releases_removed', { releases: removed });
    return processed;
}

const unauthorized = (c: Context) => c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);

/** The HTTP answer for each way an arm can end. */
const armResponse = (c: Context, outcome: ArmReleaseOutcome, subject: string) => {
    switch (outcome.kind) {
        case 'armed':
            emitDomainEvent({
                module: 'deadman',
                type: 'deadman.switch.armed',
                payload: {
                    switchId: outcome.record.id,
                    ownerId: outcome.record.ownerId,
                    roomId: null,
                    recipients: outcome.record.recipients,
                },
            });
            return c.json(envelope(DEADMAN_EVENT_NAMES.armed, outcome.record, subject), 201);
        case 'invalid_envelope':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.invalidEnvelope,
                    message: 'The release envelope is not well formed',
                    reason: outcome.problem,
                },
                400
            );
        case 'not_yours':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.notYours,
                    message: 'The envelope names another owner than the caller',
                },
                403
            );
        case 'invalid':
            return c.json({ code: 'invalid_request', message: outcome.message }, 400);
        case 'held_limit':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.liveLimit,
                    message:
                        'This account has as many release switches with their content still held ' +
                        '(armed, in grace, or fired and not yet removed) as are allowed',
                },
                409
            );
        case 'rate_limited':
            c.header('Retry-After', String(outcome.retryAfterSeconds));
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.armRateLimited,
                    message: `At most ${DEADMAN_MAX_ARMS_PER_DAY} release switches armed in any 24 hours.`,
                    retryAfterSeconds: outcome.retryAfterSeconds,
                },
                429
            );
        case 'recipient_limit':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.recipientLimit,
                    message:
                        'A copy names an account this owner already names on as many held ' +
                        'releases, or that as many other owners already name, as are allowed',
                    recipientAccountId: outcome.recipientAccountId,
                },
                409
            );
        case 'id_taken':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.releaseIdTaken,
                    message: 'A switch with this release id exists',
                },
                409
            );
        case 'write_unanswered':
            return switchWriteUnanswered(c, 'arm');
        case 'write_failed':
            return switchWriteFailed(c);
        default:
            return identityResponse(c, outcome);
    }
};

/** The answers arming and re-sealing share: identities and signatures. */
const identityResponse = (
    c: Context,
    outcome: Exclude<
        ArmReleaseOutcome,
        | { kind: 'armed' }
        | { kind: 'invalid_envelope' }
        | { kind: 'not_yours' }
        | { kind: 'invalid' }
        | { kind: 'held_limit' }
        | { kind: 'rate_limited' }
        | { kind: 'recipient_limit' }
        | { kind: 'id_taken' }
        | { kind: 'write_unanswered' }
        | { kind: 'write_failed' }
    >
) => {
    switch (outcome.kind) {
        case 'owner_identity_missing':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.ownerIdentityMissing,
                    message: 'This account has no published release identity',
                },
                409
            );
        case 'owner_identity_changed':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.ownerIdentityChanged,
                    message: "The owner identity named is not this account's current one",
                },
                409
            );
        case 'unknown_recipient':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.unknownRecipient,
                    message: 'A copy names an account without a release identity here',
                    recipientAccountId: outcome.recipientAccountId,
                },
                400
            );
        case 'recipient_identity_superseded':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.recipientIdentitySuperseded,
                    message: 'A copy is sealed to a release identity its account has replaced',
                    recipientAccountId: outcome.recipientAccountId,
                },
                409
            );
        case 'recipient_identity_unknown':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.recipientIdentityUnknown,
                    message: 'A copy is sealed to an identity its account never published',
                    recipientAccountId: outcome.recipientAccountId,
                },
                400
            );
        case 'invalid_signature':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.invalidSignature,
                    message: "A copy's signature does not verify under the owner's identity",
                    recipientAccountId: outcome.recipientAccountId,
                },
                400
            );
    }
};

const resealResponse = (c: Context, outcome: ResealReleaseOutcome) => {
    switch (outcome.kind) {
        case 'resealed':
            return c.json(recordToOwnerView(outcome.record));
        case 'not_found':
            return notFound(c);
        case 'switch_triggered':
            return c.json({ code: 'switch_triggered', message: 'Switch already triggered' }, 409);
        case 'switch_cancelled':
            return c.json({ code: 'switch_cancelled', message: 'Switch has been cancelled' }, 409);
        case 'not_a_release':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.notARelease,
                    message: 'This switch holds no release to re-seal',
                },
                409
            );
        case 'invalid_copy':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.invalidEnvelope,
                    message: 'The copy is not well formed',
                    reason: outcome.problem,
                },
                400
            );
        case 'not_a_recipient':
            return c.json(
                {
                    code: DEADMAN_RELEASE_ERRORS.notARecipient,
                    message: 'The copy is for an account this switch does not name',
                    recipientAccountId: outcome.recipientAccountId,
                },
                400
            );
        default:
            return identityResponse(c, outcome);
    }
};

function createDeadmanRouter() {
    const deadman = new Hono();

    deadman.post('/switches', jsonBodyLimit(RELEASE_ARM_MAX_BODY_BYTES), async (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'write');
        if (denied) return denied;

        // Refused before the body is parsed: see ARMING_UNAVAILABLE.
        const availability = armingAvailability();
        if (!availability.available) {
            return c.json(
                availability.reason === 'sweep_off'
                    ? ARMING_UNAVAILABLE_NO_SWEEP
                    : ARMING_UNAVAILABLE,
                409
            );
        }

        const subject = requireAuthenticatedUser(c);
        if (!subject) return unauthorized(c);

        const body = await readJsonBody(c, armSchema);
        if (body instanceof Response) return body;
        const outcome = await armReleaseSwitch({ ownerId: subject, input: body });
        return armResponse(c, outcome, subject);
    });

    deadman.post(
        '/switches/:id/reseal',
        jsonBodyLimit(RELEASE_RESEAL_MAX_BODY_BYTES),
        async (c) => {
            const denied = requireDomainCapability(c, 'deadman', 'write');
            if (denied) return denied;

            const subject = requireAuthenticatedUser(c);
            if (!subject) return unauthorized(c);

            // Not gated on the flag: a switch armed while it was on stays the
            // owner's to keep sealed to current keys (the record's §13).
            const body = await readJsonBody(c, resealSchema);
            if (body instanceof Response) return body;
            const outcome = await resealReleaseCopy({
                ownerId: subject,
                switchId: c.req.param('id'),
                copy: body.copy,
            });
            return resealResponse(c, outcome);
        }
    );

    deadman.post('/switches/:id/check-in', async (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'write');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const id = c.req.param('id');
        let existing = ownedSwitch(id, subject);
        let updated: DeadmanSwitchRecord | undefined;
        // Conditional on the switch being as read here (`updateDeadmanSwitchIf`,
        // in Postgres too): one the worker fired, or cancelled elsewhere, after
        // this process last heard of it is refused below rather than set back
        // to armed. One another check-in or the sweep's move into grace
        // changed meanwhile is checked in again over what it now is. The
        // switch as the refusal read it is looked at before every attempt,
        // the last included, so a refusal over a trigger or a cancel is
        // answered as such on any attempt (round 11 of part 2's review: the
        // third was answered `switch_changed` whatever the switch had become).
        for (let attempt = 0; ; attempt += 1) {
            if (!existing) return notFound(c);
            if (existing.status === 'triggered') {
                // Triggering only changes the switch's status: the server sends
                // the payload to no one, so the message must not say it shipped.
                return c.json(
                    { code: 'switch_triggered', message: 'Switch already triggered' },
                    409
                );
            }
            if (existing.status === 'cancelled') {
                // A cancel this process has just learned of (one answered 503
                // that landed, or one made elsewhere): any copy still held on
                // it goes now, as the cancel itself would have taken it.
                if (isReleaseSwitch(existing)) blankReleaseWraps(id);
                return c.json(
                    { code: 'switch_cancelled', message: 'Switch has been cancelled' },
                    409
                );
            }
            if (attempt >= SWITCH_WRITE_ATTEMPTS) return switchChanged(c);
            const refreshed = applyCheckIn(existing, new Date());
            const outcome = await db.updateDeadmanSwitchIf(id, existing, {
                status: refreshed.status,
                lastCheckInAt: refreshed.lastCheckInAt,
                triggerAt: refreshed.triggerAt,
                releaseAt: refreshed.releaseAt,
                // Ends a backlog window, so the next missed check-in can have one.
                backlogGraceStartedAt: refreshed.backlogGraceStartedAt,
            });
            if (outcome.kind === 'applied') {
                updated = outcome.record;
                break;
            }
            if (outcome.kind === 'unanswered') return switchWriteUnanswered(c, 'check-in');
            existing =
                outcome.current && outcome.current.ownerId === subject
                    ? outcome.current
                    : undefined;
        }

        emitDomainEvent({
            module: 'deadman',
            type: 'deadman.switch.checked_in',
            payload: { switchId: updated.id, ownerId: updated.ownerId, roomId: updated.roomId },
        });

        return c.json(envelope(DEADMAN_EVENT_NAMES.checkedIn, updated, subject));
    });

    deadman.post('/switches/:id/cancel', async (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'write');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const id = c.req.param('id');
        let existing = ownedSwitch(id, subject);
        let updated: DeadmanSwitchRecord | undefined;
        // Conditional as the check-in is: a switch that fired in Postgres
        // after this process last heard of it is not cancelled, since nothing
        // may take a release back. As there, the switch as a refusal read it
        // is looked at before every attempt, the last included.
        for (let attempt = 0; ; attempt += 1) {
            if (!existing) return notFound(c);
            if (existing.status === 'triggered') {
                return c.json(
                    {
                        code: 'switch_triggered',
                        message: 'Switch already triggered; cannot cancel',
                    },
                    409
                );
            }
            if (existing.status === 'cancelled') {
                // Cancelled before cancel cleared payloads: a second cancel is
                // how the owner removes what the store still holds. A
                // cancelled switch never moves again, so the condition cannot
                // fail on the status; the write is conditional all the same,
                // so that in Postgres it touches the content column only and
                // not the whole row from this mirror (round 11 of part 2's
                // review). One the database does not answer is 503, as the
                // cancel itself would be.
                let cleared = existing;
                if (existing.encryptedPayload) {
                    const outcome = await db.updateDeadmanSwitchIf(id, existing, {
                        encryptedPayload: '',
                    });
                    if (outcome.kind === 'unanswered') return switchWriteUnanswered(c, 'cancel');
                    cleared =
                        outcome.kind === 'applied' ? outcome.record : outcome.current ?? existing;
                }
                if (isReleaseSwitch(existing)) blankReleaseWraps(id);
                return c.json(envelope(DEADMAN_EVENT_NAMES.cancelled, cleared, subject));
            }
            if (attempt >= SWITCH_WRITE_ATTEMPTS) return switchChanged(c);

            // The payload goes with the cancel, and so do a release switch's
            // sealed copies, the owner's own included, once the cancel has
            // applied. The store keeps the rows, so the owner's list still
            // shows the switch and what became of it; backups keep the payload
            // until they expire (KNOWN_LIMITATIONS.md).
            const outcome = await db.updateDeadmanSwitchIf(id, existing, {
                status: 'cancelled',
                encryptedPayload: '',
            });
            if (outcome.kind === 'applied') {
                updated = outcome.record;
                break;
            }
            if (outcome.kind === 'unanswered') return switchWriteUnanswered(c, 'cancel');
            existing =
                outcome.current && outcome.current.ownerId === subject
                    ? outcome.current
                    : undefined;
        }
        if (isReleaseSwitch(updated)) blankReleaseWraps(id);

        emitDomainEvent({
            module: 'deadman',
            type: 'deadman.switch.cancelled',
            payload: { switchId: updated.id, ownerId: updated.ownerId, roomId: updated.roomId },
        });

        return c.json(envelope(DEADMAN_EVENT_NAMES.cancelled, updated, subject));
    });

    deadman.get('/switches', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'read');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        if (c.req.query('scope') === 'recipient') {
            // Released to the caller: triggered legacy switches only. A switch
            // that has not triggered is as absent for its recipient as for
            // anyone else, so nobody can follow an owner's check-ins through
            // it; a release switch is read through GET /releases.
            const released = db
                .listDeadmanSwitchesForRecipient(subject)
                .filter((record) => record.status === 'triggered' && !isReleaseSwitch(record))
                .map(recordToReleasedSwitch);
            return c.json({ switches: released });
        }

        return c.json({
            switches: db.listDeadmanSwitchesForOwner(subject).map(recordToOwnerView),
        });
    });

    deadman.get('/switches/:id', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'read');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const existing = db.getDeadmanSwitch(c.req.param('id'));
        if (existing && existing.ownerId === subject) {
            return c.json(recordToOwnerView(existing));
        }
        if (
            existing &&
            existing.status === 'triggered' &&
            !isReleaseSwitch(existing) &&
            existing.recipients.includes(subject)
        ) {
            return c.json(recordToReleasedSwitch(existing));
        }
        // Unknown id, someone else's switch, a recipient's switch before the
        // trigger, or a release switch (read through GET /releases): the same
        // answer for all four.
        return notFound(c);
    });

    deadman.get('/releases', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'read');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) return unauthorized(c);

        // Fired release switches that sealed a copy to the caller, with the
        // caller's own copy and nothing of anyone else's; nothing before the
        // trigger, and nothing of the caller's own switches.
        return c.json({ releases: releasedCopiesFor(subject) });
    });

    deadman.get('/limits', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'read');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) return unauthorized(c);

        return c.json(
            releaseLimits({ backlogToleranceMs: backlogToleranceMs(deadmanSweepIntervalMs()) })
        );
    });

    deadman.get('/events', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'read');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        // The event log is process-wide: it holds every user's switch events
        // (owner, room, recipients, and when an owner went quiet). Every token
        // can read this route, so it returns only the caller's own switches.
        return c.json(
            listDomainEvents('deadman').filter(
                (event) => (event.payload as { ownerId?: unknown } | null)?.ownerId === subject
            )
        );
    });

    return deadman;
}

export const deadmanModule: FeatureModule = {
    id: 'deadman',
    mountPath: '/deadman',
    registerRoutes: createDeadmanRouter,
};
