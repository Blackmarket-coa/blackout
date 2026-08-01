import { createHash, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { routeOutboundMatrixMessage, shouldRouteOutbound } from '../services/outboundMessageRouter';
import { db } from '../db/store';
import { matrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';

/**
 * Constant-time secret comparison. Both sides are SHA-256'd to a fixed
 * 32-byte digest first so the comparison neither throws on unequal input
 * lengths nor leaks the expected length through timing. Matches the
 * timing-safe discipline used elsewhere for shared-secret checks.
 */
function timingSafeSecretEqual(presented: string, expected: string): boolean {
    const a = createHash('sha256').update(presented, 'utf8').digest();
    const b = createHash('sha256').update(expected, 'utf8').digest();
    return timingSafeEqual(a, b);
}

/**
 * Phase 1 / Track A: Matrix appservice transactions endpoint.
 *
 * Synapse / Conduit / Dendrite sends event batches to a registered
 * appservice via:
 *   PUT /_matrix/app/v1/transactions/{txnId}
 *   Authorization: Bearer <hs_token>
 *   { events: [...] }
 *
 * https://spec.matrix.org/v1.10/application-service-api/#put_matrixappv1transactionstxnid
 *
 * Our handler:
 *   - validates `hs_token` against MATRIX_APPSERVICE_HS_TOKEN env;
 *   - dedupes by txnId (idempotency — Synapse retries on network blips);
 *   - for each event that's an `m.room.message` and passes
 *     {@link shouldRouteOutbound} (skip events we already injected with
 *     `m.blackout.origin` so chat from Twitch IRC doesn't echo back to
 *     Twitch IRC), calls the outbound chat router so messages landing
 *     in a bridged Matrix room from federation / other bridges fan out
 *     to the corresponding source platform.
 *
 * The route is mounted OUTSIDE the /v1 namespace because Synapse posts
 * to a fixed `/_matrix/app/v1/...` path and won't tolerate a custom
 * prefix.
 */

interface TransactionsBody {
    events?: Array<Record<string, unknown>>;
}

const MAX_REMEMBERED_TXNS = 1024;
/**
 * Tiny LRU-ish cache. We keep the most recent {@link MAX_REMEMBERED_TXNS}
 * txn ids; anything older gets evicted. Idempotency is best-effort —
 * Synapse retries within seconds, not days, so a 1k window is generous.
 */
const seenTxnIds = new Map<string, true>();
const rememberTxn = (txnId: string): boolean => {
    if (seenTxnIds.has(txnId)) return true;
    seenTxnIds.set(txnId, true);
    if (seenTxnIds.size > MAX_REMEMBERED_TXNS) {
        // Map iteration is insertion-ordered; drop the oldest.
        const oldest = seenTxnIds.keys().next().value;
        if (oldest !== undefined) seenTxnIds.delete(oldest);
    }
    return false;
};

const defaultHsTokenResolver = (): string | undefined =>
    process.env.MATRIX_APPSERVICE_HS_TOKEN?.trim() || undefined;

/**
 * Appservice → homeserver token. Reserved for the day this route grows
 * an outbound counterpart that pushes events INTO Synapse. The
 * receive-only transactions endpoint below does not need it.
 *
 * Both tokens are wired into Synapse via
 * `deploy/matrix-appservice/registration.yaml`.
 */
const defaultAsTokenResolver = (): string | undefined =>
    process.env.MATRIX_APPSERVICE_AS_TOKEN?.trim() || undefined;

export interface AppserviceRouteOptions {
    /** Returns the per-deployment homeserver token. Default: env. */
    hsTokenResolver?: () => string | undefined;
    /** Returns the per-deployment appservice token. Default: env. */
    asTokenResolver?: () => string | undefined;
    /** Route handler hook; default: outboundMessageRouter.routeOutboundMatrixMessage. */
    onMessage?: (roomId: string, body: string) => Promise<unknown> | unknown;
    /**
     * Den auto-welcome hook, fired once when a user first joins a den (gated on
     * BLACKOUT_DEN_GREETER and deduped per (roomId,userId) before this runs).
     * Default: a fire-and-forget appservice-bot post of {@link DEN_GREETING}.
     */
    greetRoom?: (roomId: string, userId: string) => Promise<unknown> | unknown;
    /** Reset the seen-txn cache. Tests use this. */
    resetCache?: boolean;
}

/** Short, warm starter posted to a den the first time someone joins it. */
export const DEN_GREETING =
    'Welcome to the den! 👋 Say hi, share what brought you here, and jump into anything that catches your eye.';

/** Fire-and-forget the welcome via the appservice bot; never blocks or throws. */
const defaultGreetRoom = (roomId: string): void => {
    void matrixClient.sendMessage(roomId, DEN_GREETING).catch((err: unknown) =>
        log.warn('matrix_appservice_den_greeting_threw', {
            roomId,
            error: String(err),
        })
    );
};

export const buildMatrixAppserviceRoute = (options: AppserviceRouteOptions = {}): Hono => {
    const router = new Hono();
    const hsTokenResolver = options.hsTokenResolver ?? defaultHsTokenResolver;
    const onMessage =
        options.onMessage ??
        ((roomId: string, body: string) => routeOutboundMatrixMessage(roomId, body));
    const greetRoom = options.greetRoom ?? defaultGreetRoom;
    if (options.resetCache) seenTxnIds.clear();

    router.put('/transactions/:txnId', async (c) => {
        const expected = hsTokenResolver();
        if (!expected) {
            // Operator misconfigured — Synapse should retry while we fix it.
            log.warn('matrix_appservice_no_hs_token_configured');
            return c.json(
                {
                    code: 'matrix_appservice_misconfigured',
                    message: 'MATRIX_APPSERVICE_HS_TOKEN is not set.',
                },
                503
            );
        }
        // Synapse uses `?access_token=...` in older versions and
        // `Authorization: Bearer ...` in v1.4+. Accept both.
        const presentedFromHeader = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
        const presentedFromQuery = c.req.query('access_token');
        const presented = presentedFromHeader || presentedFromQuery;
        if (!presented || !timingSafeSecretEqual(presented, expected)) {
            log.info('matrix_appservice_bad_token');
            return c.json({ code: 'M_FORBIDDEN' }, 403);
        }

        const txnId = c.req.param('txnId');
        if (!txnId) {
            return c.json({ code: 'M_INVALID_PARAM' }, 400);
        }

        if (rememberTxn(txnId)) {
            // Already processed — idempotent ack.
            return c.json({});
        }

        let body: TransactionsBody;
        try {
            body = (await c.req.json()) as TransactionsBody;
        } catch {
            return c.json({ code: 'M_NOT_JSON' }, 400);
        }
        const events = Array.isArray(body.events) ? body.events : [];

        for (const event of events) {
            try {
                await processEvent(event, onMessage, greetRoom);
            } catch (err) {
                log.warn('matrix_appservice_event_handler_threw', {
                    eventType: typeof event?.type === 'string' ? event.type : '?',
                    error: String(err),
                });
            }
        }

        return c.json({});
    });

    return router;
};

const processEvent = async (
    event: Record<string, unknown>,
    onMessage: (roomId: string, body: string) => Promise<unknown> | unknown,
    greetRoom: (roomId: string, userId: string) => Promise<unknown> | unknown
): Promise<void> => {
    if (event?.type === 'm.room.member') {
        await maybeGreetOnJoin(event, greetRoom);
        return;
    }
    if (event?.type !== 'm.room.message') return;
    const roomId = typeof event.room_id === 'string' ? event.room_id : null;
    const content = (event.content ?? {}) as Record<string, unknown>;
    if (!roomId) return;
    if (!shouldRouteOutbound(content)) return;
    const text = typeof content.body === 'string' ? content.body : '';
    if (!text) return;
    await onMessage(roomId, text);
};

/**
 * Auto-welcome a first-time joiner of a den. Flag-gated OFF by default
 * (BLACKOUT_DEN_GREETER === '1'). Only a *first* join fires — a membership
 * event whose `prev_content.membership` was already 'join' is a profile/avatar
 * change, not a join, and is skipped. Deduped per (roomId,userId) via the
 * durable `denGreetings` ledger so a re-join, or a Synapse transaction replay
 * under a fresh txn id, never re-greets. The greet itself is fire-and-forget.
 */
const maybeGreetOnJoin = async (
    event: Record<string, unknown>,
    greetRoom: (roomId: string, userId: string) => Promise<unknown> | unknown
): Promise<void> => {
    if (process.env.BLACKOUT_DEN_GREETER !== '1') return;
    const roomId = typeof event.room_id === 'string' ? event.room_id : null;
    // For m.room.member, the state_key is the user the membership applies to.
    const userId = typeof event.state_key === 'string' ? event.state_key : null;
    if (!roomId || !userId) return;
    const content = (event.content ?? {}) as Record<string, unknown>;
    if (content.membership !== 'join') return;
    const prevContent = (event.unsigned as Record<string, unknown> | undefined)?.prev_content as
        | Record<string, unknown>
        | undefined;
    if (prevContent?.membership === 'join') return; // not a first join
    if (db.hasGreeted(roomId, userId)) return;
    // Stamp before sending so a concurrent replay can't double-greet; the send is
    // best-effort and a failed post simply means this joiner isn't greeted.
    db.markGreeted(roomId, userId);
    await greetRoom(roomId, userId);
};

export const __test__ = {
    resetSeenTxns: () => seenTxnIds.clear(),
};

export default buildMatrixAppserviceRoute();
