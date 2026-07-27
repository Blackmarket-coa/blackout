import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';

/**
 * Request body-size limits (audit finding M5).
 *
 * Global backstop. MUST stay above the largest legitimate JSON body:
 * widget-report attachments (routes/widgetReport.ts MAX_ATTACHMENT_B64 =
 * 11_500_000 base64 chars) and media/perturb (~11.2 MB base64 of an 8 MiB
 * image). 16 MiB leaves ~5 MB of envelope headroom. If either of those caps
 * grows past ~15 MB, raise this in lockstep.
 */
export const GLOBAL_MAX_BODY_BYTES = 16 * 1024 * 1024; // 16 MiB

/**
 * Tight cap for the unauthenticated raw-body HMAC webhook receivers (Twitch
 * EventSub, Patreon; also suitable for Lago / marketplace). Real deliveries are
 * a few KB; 256 KiB bounds how much we buffer BEFORE the signature check so an
 * anonymous sender can't exhaust memory pre-auth.
 */
export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024; // 256 KiB

// index.ts installs a custom app.onError that converts ANY thrown error into a
// generic 500. hono's DEFAULT bodyLimit onError THROWS HTTPException(413),
// which this app would swallow into a 500. Return the 413 Response directly so
// it bypasses app.onError and matches the API's JSON error contract. bodyLimit
// uses this Response as-is on both the Content-Length fast path (rejects before
// buffering) and the streamed path.
const onError = (c: Context) =>
    c.json(
        { code: 'payload_too_large', message: 'Request body exceeds the maximum allowed size.' },
        413
    );

/** Body-limit middleware capped at `maxSize` bytes, wired to the JSON 413 contract. */
export const jsonBodyLimit = (maxSize: number) => bodyLimit({ maxSize, onError });
