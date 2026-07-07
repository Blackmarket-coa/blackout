import { Hono } from 'hono';
import { z } from 'zod';
import { DEADMAN_EVENT_NAMES, type DeadmanSwitchPayload } from '@blackout/protocol';
import { db } from '../db/store';
import type { DeadmanSwitchRecord } from '../db/types';
import { readJsonBody } from '../middleware/validate';
import { requireAuthenticatedUser, requireDomainCapability } from './authz';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import {
    MAX_CHECK_IN_INTERVAL_SECONDS,
    MAX_GRACE_PERIOD_SECONDS,
    MAX_RECIPIENTS,
    MIN_CHECK_IN_INTERVAL_SECONDS,
    MIN_GRACE_PERIOD_SECONDS,
    applyCheckIn,
    computeDeadlines,
    evaluateTransition,
    validateArmInput,
} from '../services/deadmanScheduler';
import type { FeatureModule } from './types';

const armSchema = z.object({
    roomId: z.string().min(1),
    ownerId: z.string().min(1).optional(),
    checkInIntervalSeconds: z
        .number()
        .int()
        .min(MIN_CHECK_IN_INTERVAL_SECONDS)
        .max(MAX_CHECK_IN_INTERVAL_SECONDS),
    gracePeriodSeconds: z
        .number()
        .int()
        .min(MIN_GRACE_PERIOD_SECONDS)
        .max(MAX_GRACE_PERIOD_SECONDS),
    recipients: z.array(z.string().min(1)).min(1).max(MAX_RECIPIENTS),
    encryptedPayload: z.string().min(1),
    headline: z.string().max(280).optional(),
});

const processOverdueSchema = z.object({ now: z.string().datetime().optional() }).partial();

export const recordToPayload = (record: DeadmanSwitchRecord): DeadmanSwitchPayload => ({
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
    encryptedPayload: record.encryptedPayload,
    headline: record.headline,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
});

const envelope = (event: string, record: DeadmanSwitchRecord, senderId: string) => ({
    event,
    roomId: record.roomId,
    senderId,
    occurredAt: new Date().toISOString(),
    payload: recordToPayload(record),
});

function createDeadmanRouter() {
    const deadman = new Hono();

    deadman.post('/switches', async (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'write');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const parsed = await readJsonBody(c, armSchema);
        if (parsed instanceof Response) return parsed;

        const validationError = validateArmInput({
            checkInIntervalSeconds: parsed.checkInIntervalSeconds,
            gracePeriodSeconds: parsed.gracePeriodSeconds,
            recipients: parsed.recipients,
            encryptedPayload: parsed.encryptedPayload,
        });
        if (validationError) {
            return c.json({ code: 'invalid_request', message: validationError }, 400);
        }

        const ownerId = parsed.ownerId ?? subject;
        if (ownerId !== subject) {
            return c.json(
                {
                    code: 'forbidden',
                    message: 'A switch can only be armed for the calling subject',
                },
                403
            );
        }

        const lastCheckInAt = new Date().toISOString();
        const { triggerAt, releaseAt } = computeDeadlines({
            lastCheckInAt,
            checkInIntervalSeconds: parsed.checkInIntervalSeconds,
            gracePeriodSeconds: parsed.gracePeriodSeconds,
        });

        const record = db.createDeadmanSwitch({
            id: crypto.randomUUID(),
            ownerId,
            roomId: parsed.roomId,
            status: 'armed',
            checkInIntervalSeconds: parsed.checkInIntervalSeconds,
            gracePeriodSeconds: parsed.gracePeriodSeconds,
            lastCheckInAt,
            triggerAt,
            releaseAt,
            recipients: parsed.recipients,
            encryptedPayload: parsed.encryptedPayload,
            headline: parsed.headline,
        });

        emitDomainEvent({
            module: 'deadman',
            type: 'deadman.switch.armed',
            payload: { switchId: record.id, ownerId: record.ownerId, roomId: record.roomId },
        });

        return c.json(envelope(DEADMAN_EVENT_NAMES.armed, record, subject), 201);
    });

    deadman.post('/switches/:id/check-in', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'write');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const id = c.req.param('id');
        const existing = db.getDeadmanSwitch(id);
        if (!existing) {
            return c.json({ code: 'switch_not_found', message: 'Switch not found' }, 404);
        }
        if (existing.ownerId !== subject) {
            return c.json(
                { code: 'forbidden', message: 'Only the switch owner may check in' },
                403
            );
        }
        if (existing.status === 'triggered') {
            return c.json(
                {
                    code: 'switch_triggered',
                    message: 'Switch already triggered; payload has shipped',
                },
                409
            );
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
        });
        if (!updated) {
            return c.json({ code: 'switch_not_found', message: 'Switch not found' }, 404);
        }

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
        const existing = db.getDeadmanSwitch(id);
        if (!existing) {
            return c.json({ code: 'switch_not_found', message: 'Switch not found' }, 404);
        }
        if (existing.ownerId !== subject) {
            return c.json({ code: 'forbidden', message: 'Only the switch owner may cancel' }, 403);
        }
        if (existing.status === 'triggered') {
            return c.json(
                { code: 'switch_triggered', message: 'Switch already triggered; cannot cancel' },
                409
            );
        }
        if (existing.status === 'cancelled') {
            return c.json(envelope(DEADMAN_EVENT_NAMES.cancelled, existing, subject));
        }

        const updated = db.setDeadmanSwitchStatus(id, 'cancelled');
        if (!updated) {
            return c.json({ code: 'switch_not_found', message: 'Switch not found' }, 404);
        }

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

        const scope = c.req.query('scope') === 'recipient' ? 'recipient' : 'owner';
        const records =
            scope === 'recipient'
                ? db.listDeadmanSwitchesForRecipient(subject)
                : db.listDeadmanSwitchesForOwner(subject);

        return c.json({ switches: records.map(recordToPayload) });
    });

    deadman.get('/switches/:id', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'read');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const existing = db.getDeadmanSwitch(c.req.param('id'));
        if (!existing) {
            return c.json({ code: 'switch_not_found', message: 'Switch not found' }, 404);
        }
        const visible = existing.ownerId === subject || existing.recipients.includes(subject);
        if (!visible) {
            return c.json(
                { code: 'forbidden', message: 'Switch is not visible to the calling subject' },
                403
            );
        }
        return c.json(recordToPayload(existing));
    });

    deadman.post('/process-overdue', async (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'write');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        if (!subject) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const parsed = await readJsonBody(c, processOverdueSchema);
        if (parsed instanceof Response) return parsed;

        const now = parsed.now ? new Date(parsed.now) : new Date();
        const evaluatedAt = now.toISOString();
        const processed: DeadmanSwitchPayload[] = [];

        // Scope the sweep to switches owned by the authenticated caller. Previously
        // this iterated every switch globally, letting any `deadman.write` holder
        // drive state transitions on other users' switches.
        const ownSwitches = db
            .listAllDeadmanSwitches()
            .filter((record) => record.ownerId === subject);
        for (const record of ownSwitches) {
            const transition = evaluateTransition(record, now);
            if (transition.kind === 'none') continue;

            const updated = db.setDeadmanSwitchStatus(record.id, transition.record.status);
            if (!updated) continue;

            const eventName =
                transition.kind === 'grace'
                    ? DEADMAN_EVENT_NAMES.grace
                    : DEADMAN_EVENT_NAMES.triggered;

            emitDomainEvent({
                module: 'deadman',
                type:
                    transition.kind === 'grace'
                        ? 'deadman.switch.grace'
                        : 'deadman.switch.triggered',
                payload: {
                    switchId: updated.id,
                    ownerId: updated.ownerId,
                    roomId: updated.roomId,
                    recipients: updated.recipients,
                },
            });

            processed.push(recordToPayload(updated));
            void eventName;
        }

        return c.json({ processed, evaluatedAt });
    });

    deadman.get('/events', (c) => {
        const denied = requireDomainCapability(c, 'deadman', 'read');
        if (denied) return denied;
        return c.json(listDomainEvents('deadman'));
    });

    return deadman;
}

export const deadmanModule: FeatureModule = {
    id: 'deadman',
    mountPath: '/deadman',
    registerRoutes: createDeadmanRouter,
};
