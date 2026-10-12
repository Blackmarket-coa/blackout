import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import { botPostRefusalResponse, checkBotMayPostAs } from '../services/botPostingGate';

const scheduledMessages = new Hono();

/**
 * How far ahead a message may be scheduled. The composer offers +1h and +4h;
 * 30 days is a default, not a product promise. It also keeps `deliverAt` a
 * four-digit-year ISO string, which the due-message scan compares as text.
 */
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

const createScheduledMessageSchema = z.object({
    matrixRoomId: z.string().trim().min(1),
    body: z.string().trim().min(1).max(8000),
    formattedBody: z.string().max(50_000).optional(),
    // Validated as a parseable timestamp below; kept as a plain string here so a
    // malformed value yields our typed 400 rather than a zod shape error.
    deliverAt: z.string().trim().min(1),
});

scheduledMessages.get('/', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ scheduledMessages: db.listPendingScheduledMessagesForUser(user.sub) });
});

scheduledMessages.post('/', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, createScheduledMessageSchema);
    if (parsed instanceof Response) return parsed;
    const { matrixRoomId, body, formattedBody, deliverAt } = parsed;

    const deliverMs = Date.parse(deliverAt);
    if (Number.isNaN(deliverMs)) {
        return c.json(
            { code: 'invalid_deliver_at', message: 'deliverAt must be a valid ISO-8601 timestamp' },
            400
        );
    }
    if (deliverMs <= Date.now()) {
        return c.json(
            { code: 'deliver_at_in_past', message: 'deliverAt must be in the future' },
            400
        );
    }
    if (deliverMs > Date.now() + MAX_SCHEDULE_AHEAD_MS) {
        return c.json(
            {
                code: 'deliver_at_too_far',
                message: 'deliverAt must be at most 30 days in the future',
            },
            400
        );
    }

    // The bot posts this later as plaintext, under the author's name. Refuse now
    // (and store nothing) unless the author is a joined member who may post, the
    // room is not encrypted, and the bot is in it. The dispatcher checks again
    // right before sending, because any of that can change in the meantime.
    const verdict = await checkBotMayPostAs(user.sub, matrixRoomId);
    if (!verdict.ok) {
        const refusal = botPostRefusalResponse(verdict.reason);
        return c.json(refusal.body, refusal.status);
    }

    const record = db.createScheduledMessage({
        id: crypto.randomUUID(),
        userId: user.sub,
        matrixRoomId,
        body,
        formattedBody,
        deliverAt: new Date(deliverMs).toISOString(),
    });

    return c.json({ scheduledMessage: record }, 201);
});

scheduledMessages.delete('/:id', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const { id } = c.req.param();
    const cancelled = db.cancelScheduledMessage(id, user.sub);
    if (!cancelled) {
        return c.json(
            { code: 'not_found', message: 'No pending scheduled message with that id' },
            404
        );
    }
    return c.json({ scheduledMessage: cancelled });
});

export default scheduledMessages;
