import { Hono } from 'hono';
import type { Context } from 'hono';
import {
    DEADMAN_EVENT_NAMES,
    type DeadmanReleasedSwitch,
    type DeadmanSwitchPayload,
} from '@blackout/protocol';
import { db } from '../db/store';
import type { DeadmanSwitchRecord } from '../db/types';
import { BACKLOG_TOLERANCE_FLOOR_MS } from '../services/backlogTolerance';
import { log } from '../telemetry/logger';
import { requireAuthenticatedUser, requireDomainCapability } from './authz';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { applyCheckIn, evaluateSweepTransition } from '../services/deadmanScheduler';
import type { FeatureModule } from './types';

/**
 * Why `POST /switches` refuses every arm. The server cannot release a message
 * to anyone yet: triggering changes a status, and nobody is told. Arming
 * reopens with the release (`docs/security/deadman-release-design-2026-10-24.md`
 * §8, PR 4), in a new format. Until then the only honest answer to an arm is
 * this one, given before the body is read so that nothing about the request
 * is stored and every caller gets the same reply.
 */
export const ARMING_UNAVAILABLE = {
    code: 'arming_unavailable',
    message:
        'Arming is not available: Blackout cannot release a message to anyone yet. ' +
        'Existing switches can be checked in and cancelled.',
} as const;

/**
 * The one answer for a switch the caller may not act on: an id that names no
 * switch, someone else's switch, and a recipient's switch before it has
 * triggered all get this same status and body. A 403 for "exists, not yours"
 * next to a 404 for "does not exist" would let anyone holding an id learn
 * whether a switch exists, and let a recipient follow one before release.
 */
const SWITCH_NOT_FOUND = { code: 'switch_not_found', message: 'Switch not found' } as const;

const notFound = (c: Context) => c.json(SWITCH_NOT_FOUND, 404);

/**
 * The switch as its owner sees it. `encryptedPayload` is present while the
 * store still holds one: cancel clears it (as account deletion does for a
 * switch that has not fired), so a cancelled switch's view carries none.
 * Only the owner gets this view; a recipient gets `recordToReleasedSwitch`,
 * after the trigger.
 */
export const recordToOwnerView = (record: DeadmanSwitchRecord): DeadmanSwitchPayload => {
    const payload: DeadmanSwitchPayload = {
        switchId: record.id,
        ownerId: record.ownerId,
        roomId: record.roomId,
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
    };
    if (record.encryptedPayload) {
        payload.encryptedPayload = record.encryptedPayload;
    }
    return payload;
};

/**
 * The switch as a recipient sees it, once it has triggered: the payload and
 * enough to say whose it is and when it was due. No check-in history, no
 * interval, no room, no label, no other recipients. Callers must check the
 * status first; this never looks at it.
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
    roomId: record.roomId,
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
 */
export function sweepOverdueDeadmanSwitches(
    now: Date = new Date(),
    toleranceMs: number = BACKLOG_TOLERANCE_FLOOR_MS
): number {
    let processed = 0;
    let backlogWindows = 0;
    for (const record of db.listAllDeadmanSwitches()) {
        const transition = evaluateSweepTransition(record, now, toleranceMs);
        if (transition.kind === 'none') continue;

        const updated =
            transition.kind === 'backlog_grace'
                ? db.updateDeadmanSwitch(record.id, {
                      status: transition.record.status,
                      releaseAt: transition.record.releaseAt,
                      backlogGraceStartedAt: transition.record.backlogGraceStartedAt,
                  })
                : db.setDeadmanSwitchStatus(record.id, transition.record.status);
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
                roomId: updated.roomId,
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
    return processed;
}

function createDeadmanRouter() {
    const deadman = new Hono();

    deadman.post('/switches', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'write');
        if (denied) return denied;

        // Refused before the body is read: see ARMING_UNAVAILABLE.
        return c.json(ARMING_UNAVAILABLE, 409);
    });

    deadman.post('/switches/:id/check-in', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'write');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const id = c.req.param('id');
        const existing = ownedSwitch(id, subject);
        if (!existing) return notFound(c);
        if (existing.status === 'triggered') {
            // Triggering only changes the switch's status: the server sends
            // the payload to no one, so the message must not say it shipped.
            return c.json({ code: 'switch_triggered', message: 'Switch already triggered' }, 409);
        }
        if (existing.status === 'cancelled') {
            return c.json({ code: 'switch_cancelled', message: 'Switch has been cancelled' }, 409);
        }

        const refreshed = applyCheckIn(existing, new Date());
        const updated = db.updateDeadmanSwitch(id, {
            status: refreshed.status,
            lastCheckInAt: refreshed.lastCheckInAt,
            triggerAt: refreshed.triggerAt,
            releaseAt: refreshed.releaseAt,
            // Ends a backlog window, so the next missed check-in can have one.
            backlogGraceStartedAt: refreshed.backlogGraceStartedAt,
        });
        if (!updated) return notFound(c);

        emitDomainEvent({
            module: 'deadman',
            type: 'deadman.switch.checked_in',
            payload: { switchId: updated.id, ownerId: updated.ownerId, roomId: updated.roomId },
        });

        return c.json(envelope(DEADMAN_EVENT_NAMES.checkedIn, updated, subject));
    });

    deadman.post('/switches/:id/cancel', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'write');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const id = c.req.param('id');
        const existing = ownedSwitch(id, subject);
        if (!existing) return notFound(c);
        if (existing.status === 'triggered') {
            return c.json(
                { code: 'switch_triggered', message: 'Switch already triggered; cannot cancel' },
                409
            );
        }
        if (existing.status === 'cancelled') {
            // Cancelled before cancel cleared payloads: a second cancel is how
            // the owner removes what the store still holds.
            const cleared = existing.encryptedPayload
                ? db.updateDeadmanSwitch(id, { encryptedPayload: '' }) ?? existing
                : existing;
            return c.json(envelope(DEADMAN_EVENT_NAMES.cancelled, cleared, subject));
        }

        // The payload goes with the cancel. The store keeps the row, so the
        // owner's list still shows the switch and what became of it; backups
        // keep the payload until they expire (KNOWN_LIMITATIONS.md).
        const updated = db.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
        if (!updated) return notFound(c);

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
            // Released to the caller: triggered switches only. A switch that
            // has not triggered is as absent for its recipient as for anyone
            // else, so nobody can follow an owner's check-ins through it.
            const released = db
                .listDeadmanSwitchesForRecipient(subject)
                .filter((record) => record.status === 'triggered')
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
        if (existing && existing.status === 'triggered' && existing.recipients.includes(subject)) {
            return c.json(recordToReleasedSwitch(existing));
        }
        // Unknown id, someone else's switch, or a recipient's switch before
        // the trigger: the same answer for all three.
        return notFound(c);
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
