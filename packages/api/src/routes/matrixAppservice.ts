import { Hono } from 'hono';
import {
  routeOutboundMatrixMessage,
  shouldRouteOutbound,
} from '../services/outboundMessageRouter';
import { log } from '../telemetry/logger';

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
  /** Reset the seen-txn cache. Tests use this. */
  resetCache?: boolean;
}

export const buildMatrixAppserviceRoute = (
  options: AppserviceRouteOptions = {},
): Hono => {
  const router = new Hono();
  const hsTokenResolver = options.hsTokenResolver ?? defaultHsTokenResolver;
  const onMessage =
    options.onMessage ??
    ((roomId: string, body: string) => routeOutboundMatrixMessage(roomId, body));
  if (options.resetCache) seenTxnIds.clear();

  router.put('/transactions/:txnId', async (c) => {
    const expected = hsTokenResolver();
    if (!expected) {
      // Operator misconfigured — Synapse should retry while we fix it.
      log.warn('matrix_appservice_no_hs_token_configured');
      return c.json(
        { code: 'matrix_appservice_misconfigured', message: 'MATRIX_APPSERVICE_HS_TOKEN is not set.' },
        503,
      );
    }
    // Synapse uses `?access_token=...` in older versions and
    // `Authorization: Bearer ...` in v1.4+. Accept both.
    const presentedFromHeader = c.req
      .header('authorization')
      ?.replace(/^Bearer\s+/i, '');
    const presentedFromQuery = c.req.query('access_token');
    const presented = presentedFromHeader || presentedFromQuery;
    if (presented !== expected) {
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
        await processEvent(event, onMessage);
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
): Promise<void> => {
  if (event?.type !== 'm.room.message') return;
  const roomId = typeof event.room_id === 'string' ? event.room_id : null;
  const content = (event.content ?? {}) as Record<string, unknown>;
  if (!roomId) return;
  if (!shouldRouteOutbound(content)) return;
  const text = typeof content.body === 'string' ? content.body : '';
  if (!text) return;
  await onMessage(roomId, text);
};

export const __test__ = {
  resetSeenTxns: () => seenTxnIds.clear(),
};

export default buildMatrixAppserviceRoute();
