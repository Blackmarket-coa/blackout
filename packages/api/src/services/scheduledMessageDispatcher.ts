import { formatFederatedMessage } from '@blackout/core';
import { db } from '../db/store';
import { matrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';
import {
    checkBotMayPostAs,
    RETRYABLE_BOT_POST_REFUSALS,
    type BotPostVerdict,
} from './botPostingGate';

/**
 * Background dispatcher that delivers due scheduled messages into their Matrix
 * room. A user schedules a message via `POST /v1/scheduled-messages`; this loop
 * picks it up once `deliverAt` passes and sends it server-side, so delivery
 * happens even when the author's client is closed.
 *
 * Single-process by design (mirrors the Streamlabs/YouTube schedulers) — a
 * multi-replica deployment would need a postgres advisory lock to avoid two
 * replicas double-sending. The Matrix transaction id is derived from the
 * scheduled-message id, so the homeserver dedupes a re-sent message within its
 * txn window even if a crash happened between send and status update.
 *
 * Delivery is bot-attributed: the message body is prefixed with the author's
 * name via `formatFederatedMessage`, exactly like the synchronous send path in
 * `routes/messages.ts`. Sending *as* the author would require wiring the Matrix
 * appservice token + user impersonation, which is a larger change.
 *
 * Every send first passes `checkBotMayPostAs` again, right before it happens:
 * the author must still exist, still be a joined member who may post, the room
 * must still be unencrypted and the bot still in it. The POST route checked the
 * same things, but they can change in the hours between, and rows stored before
 * that check existed were never checked at all. A refusal ends the message with
 * `refused_<reason>` and no send; only a failed check (an outage) is retried.
 * The event carries no Blackout user id.
 */

export const DEFAULT_INTERVAL_MS = 30 * 1000; // 30 seconds
const MAX_ATTEMPTS = 5;

let timer: ReturnType<typeof setInterval> | null = null;

const escapeHtml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

export interface DispatchResult {
    /** Messages that were due this tick. */
    due: number;
    /** Successfully delivered to Matrix. */
    delivered: number;
    /** Permanently failed (exhausted MAX_ATTEMPTS). */
    failed: number;
    /** Failed this tick but left pending for a later retry. */
    retried: number;
    /** Refused by the bot-posting gate and ended without a send. */
    refused: number;
}

/**
 * Deliver every due scheduled message. Per-message failures are isolated — one
 * bad message never blocks the rest — and surface in the structured log.
 */
export const runScheduledMessageDispatch = async (): Promise<DispatchResult> => {
    const due = db.listDueScheduledMessages();
    const result: DispatchResult = {
        due: due.length,
        delivered: 0,
        failed: 0,
        retried: 0,
        refused: 0,
    };

    for (const dueMsg of due) {
        const terminalOnFailure = dueMsg.attempts + 1 >= MAX_ATTEMPTS;

        let verdict: BotPostVerdict;
        try {
            verdict = await checkBotMayPostAs(dueMsg.userId, dueMsg.matrixRoomId);
        } catch (err) {
            log.warn('scheduled_message_room_check_threw', {
                scheduledMessageId: dueMsg.id,
                error: String(err),
            });
            verdict = { ok: false, reason: 'room_check_unavailable' };
        }

        // The check waited on the homeserver. Meanwhile the author may have
        // cancelled the message or deleted their account (which erases it), so
        // act only on the row as it is now, and only while it is still pending
        // for the same author.
        const msg = db.getScheduledMessage(dueMsg.id);
        if (!msg || msg.status !== 'pending' || !msg.userId || msg.userId !== dueMsg.userId) {
            continue;
        }

        if (!verdict.ok) {
            if (RETRYABLE_BOT_POST_REFUSALS.has(verdict.reason)) {
                db.markScheduledMessageFailed(msg.id, verdict.reason, {
                    terminal: terminalOnFailure,
                });
                if (terminalOnFailure) {
                    result.failed += 1;
                    log.warn('scheduled_message_failed_permanently', {
                        scheduledMessageId: msg.id,
                        reason: verdict.reason,
                    });
                } else {
                    result.retried += 1;
                }
            } else {
                db.markScheduledMessageFailed(msg.id, `refused_${verdict.reason}`, {
                    terminal: true,
                });
                result.refused += 1;
                log.warn('scheduled_message_refused', {
                    scheduledMessageId: msg.id,
                    reason: verdict.reason,
                });
            }
            continue;
        }

        // Never post for a missing author, and never fall back to the raw id.
        const sender = db.getUserById(msg.userId);
        if (!sender) {
            db.markScheduledMessageFailed(msg.id, 'refused_author_unknown', { terminal: true });
            result.refused += 1;
            log.warn('scheduled_message_refused', {
                scheduledMessageId: msg.id,
                reason: 'author_unknown',
            });
            continue;
        }
        const attribution = sender.username;
        const content: Record<string, unknown> = {
            msgtype: 'm.text',
            body: formatFederatedMessage(attribution, msg.body),
            'co.blackout.scheduled': {
                scheduled_message_id: msg.id,
                deliver_at: msg.deliverAt,
            },
        };
        if (msg.formattedBody) {
            content.format = 'org.matrix.custom.html';
            content.formatted_body = `<strong>${escapeHtml(attribution)}</strong>: ${
                msg.formattedBody
            }`;
        }

        try {
            const sent = await matrixClient.sendEvent(msg.matrixRoomId, content, {
                txnId: `sched-${msg.id}`,
            });
            if (sent.ok) {
                db.markScheduledMessageDelivered(msg.id);
                result.delivered += 1;
                continue;
            }
            const reason = 'reason' in sent ? sent.reason : `status_${sent.status}`;
            db.markScheduledMessageFailed(msg.id, `matrix_${reason}`, {
                terminal: terminalOnFailure,
            });
            if (terminalOnFailure) {
                result.failed += 1;
                log.warn('scheduled_message_failed_permanently', {
                    scheduledMessageId: msg.id,
                    reason,
                });
            } else {
                result.retried += 1;
            }
        } catch (err) {
            db.markScheduledMessageFailed(msg.id, String(err), { terminal: terminalOnFailure });
            if (terminalOnFailure) {
                result.failed += 1;
                log.warn('scheduled_message_failed_permanently', {
                    scheduledMessageId: msg.id,
                    error: String(err),
                });
            } else {
                result.retried += 1;
            }
        }
    }

    return result;
};

/**
 * Start the periodic dispatcher. Idempotent — repeat calls return the same stop
 * handle. The timer is `.unref()`'d so it never keeps the process alive alone.
 */
export const startScheduledMessageDispatcher = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopScheduledMessageDispatcher };
    timer = setInterval(() => {
        void runScheduledMessageDispatch().catch((err) => {
            log.warn('scheduled_message_dispatch_tick_threw', { error: String(err) });
        });
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopScheduledMessageDispatcher };
};

export const stopScheduledMessageDispatcher = (): void => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

export const isScheduledMessageDispatcherRunning = (): boolean => timer !== null;
