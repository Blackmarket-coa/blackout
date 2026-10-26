import { Hono } from 'hono';
import { jsonBodyLimit, WEBHOOK_MAX_BODY_BYTES } from '../middleware/body-limit';
import { isLiveKitConfigured } from '../services/livekit';
import { handleLiveKitWebhookEvent, verifyLiveKitWebhook } from '../services/livekitWebhook';
import { log } from '../telemetry/logger';

/**
 * `POST /v1/voice/livekit/webhook`: the LiveKit server's room events, so that a
 * mute or a removal that stands is applied when the person comes back
 * (`services/livekitWebhook.ts`). It does anything only when the LiveKit server
 * is configured to send them here (`webhook.urls` and `webhook.api_key` in
 * LiveKit's config; `packages/api/README.md`).
 *
 * Not a Blackout session route. LiveKit puts its JWT in `Authorization` with no
 * `Bearer ` prefix, so the `/v1` auth middleware passes the request on as an
 * anonymous one (a `Bearer ` header is refused there as a bad session, before
 * this route). The body is read raw, as the Twitch and Patreon receivers read
 * theirs, because the signature covers its exact bytes, and it is capped at
 * 256 KiB before it is buffered. Nothing in it is acted on unless it verifies.
 *
 * Answers:
 *   - 503 `livekit_not_configured`: LiveKit is not configured; nothing is read.
 *   - 401 `webhook_unverified`: the delivery does not verify (no header, another
 *     secret or key, another body, expired) or cannot be read; nothing is done.
 *   - 200: handled, whether a standing sanction was applied or there was
 *     nothing to apply.
 *   - 502 `livekit_unavailable`: LiveKit did not carry out a standing sanction.
 *
 * LiveKit retries a delivery answered 5xx or 429 up to four times, waiting 1, 2,
 * 4 and 8 seconds, or what a 429's or a 503's `Retry-After` says; it does not
 * retry one answered with any other 4xx.
 */
export const LIVEKIT_WEBHOOK_PATH = '/voice/livekit/webhook';

const livekitWebhook = new Hono();
livekitWebhook.use('*', jsonBodyLimit(WEBHOOK_MAX_BODY_BYTES));

livekitWebhook.post('/', async (c) => {
    if (!isLiveKitConfigured()) {
        return c.json(
            {
                code: 'livekit_not_configured',
                message: 'LiveKit is not configured on this server.',
            },
            503
        );
    }

    const rawBody = await c.req.text();
    const verified = await verifyLiveKitWebhook(rawBody, c.req.header('authorization'));
    if (!verified.ok) {
        log.warn('livekit_webhook_rejected', { reason: verified.reason });
        return c.json(
            {
                code: 'webhook_unverified',
                message: 'This delivery could not be verified.',
            },
            401
        );
    }

    const outcome = await handleLiveKitWebhookEvent(verified.event);
    return c.json(outcome.body, outcome.status);
});

export default livekitWebhook;
