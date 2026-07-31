import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { integrationsRateLimit } from '../middleware/rate-limit';
import {
    createWebhook,
    deleteWebhook,
    deliverWebhookPayload,
    listWebhooksForUser,
} from '../services/discordCompatWebhooks';
import type { DiscordCompatWebhookRecord } from '../db/types';

/**
 * Two routers in this file:
 *
 * 1. {@link authedRouter} — the creator-facing CRUD surface, mounted under
 *    `/v1/integrations/discord-compat/webhooks`. Standard auth.
 *
 * 2. {@link publicExecuteRouter} — the Discord-wire-compatible execute
 *    endpoint, mounted under `/discord-compat/webhooks/:id/:token`. No
 *    Bearer auth: the URL token IS the auth, just like Discord.
 */

const projectRecord = (record: DiscordCompatWebhookRecord) => ({
    id: record.id,
    matrixRoomId: record.matrixRoomId,
    name: record.name,
    avatarUrl: record.avatarUrl,
    isActive: record.isActive,
    lastUsedAt: record.lastUsedAt,
    deliveryCount: record.deliveryCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
});

// ---------------------------- authed CRUD -----------------------------------

const authedRouter = new Hono();
// Settings-surface bucket, NOT the tight fail-closed `auth` bucket: the
// bridges & webhooks panel lists these on mount alongside its siblings.
authedRouter.use('/', integrationsRateLimit);
authedRouter.use('/:id', integrationsRateLimit);

const createSchema = z.object({
    matrixRoomId: z.string().min(1).max(255),
    name: z.string().min(1).max(80),
    avatarUrl: z.string().min(1).max(2048).optional(),
});

authedRouter.get('/', (c) => {
    const userOrResp = requireUser(c, 'Sign in required to list Discord-compat webhooks');
    if (userOrResp instanceof Response) return userOrResp;
    return c.json({
        webhooks: listWebhooksForUser(userOrResp.sub).map(projectRecord),
    });
});

authedRouter.post('/', async (c) => {
    const userOrResp = requireUser(c, 'Sign in required to create a Discord-compat webhook');
    if (userOrResp instanceof Response) return userOrResp;
    const parsed = await readJsonBody(c, createSchema);
    if (parsed instanceof Response) return parsed;

    const out = createWebhook({
        blackoutUserId: userOrResp.sub,
        matrixRoomId: parsed.matrixRoomId,
        name: parsed.name,
        avatarUrl: parsed.avatarUrl,
    });
    switch (out.kind) {
        case 'ok':
            // The plaintext token only ever lands in the response body of *this*
            // call. The UI must surface a "copy URL once" banner to the user.
            return c.json(
                {
                    webhook: projectRecord(out.record),
                    token: out.token,
                    url: `/discord-compat/webhooks/${out.record.id}/${out.token}`,
                },
                201
            );
        case 'invalid_input':
            return c.json({ code: 'invalid_input', message: out.reason }, 400);
        default: {
            const exhaustive: never = out;
            return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
        }
    }
});

authedRouter.delete('/:id', (c) => {
    const userOrResp = requireUser(c, 'Sign in required to delete a Discord-compat webhook');
    if (userOrResp instanceof Response) return userOrResp;
    const id = c.req.param('id');
    const out = deleteWebhook(userOrResp.sub, id);
    switch (out.kind) {
        case 'ok':
            return c.json({ ok: true });
        case 'not_found':
            return c.json({ code: 'not_found', message: 'No webhook with that id.' }, 404);
        case 'forbidden':
            return c.json({ code: 'forbidden', message: 'You do not own that webhook.' }, 403);
        default: {
            const exhaustive: never = out;
            return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
        }
    }
});

// -------------------------- public execute ----------------------------------

const publicExecuteRouter = new Hono();

/**
 * Discord's webhook execute is `POST /api/webhooks/{id}/{token}` and
 * returns 204 (or the message JSON when `?wait=true`). We mirror the
 * 204-default behaviour and ignore `?wait=true` for now (returning 204
 * regardless) — Discord's `wait=true` returns the created message
 * object, which we don't have a Matrix-side analogue for yet.
 *
 * 404 on bad id+token (Discord-style) so a brute-force prober can't
 * tell "wrong token" from "no such webhook".
 */
publicExecuteRouter.post('/:id/:token', async (c) => {
    const id = c.req.param('id');
    const token = c.req.param('token');
    let payload: unknown = {};
    const ct = c.req.header('content-type') ?? '';
    if (ct.includes('application/json')) {
        try {
            payload = await c.req.json();
        } catch {
            return c.json({ code: 'invalid_json', message: 'Body must be valid JSON.' }, 400);
        }
    }
    // Cast: we accept any shape and simply read the fields we know about.
    const out = await deliverWebhookPayload(id, token, payload as Record<string, unknown>);
    switch (out.kind) {
        case 'ok':
            return new Response(null, { status: 204 });
        case 'invalid_token':
            // Match Discord's 404 on either bad id or bad token.
            return c.json({ code: 'unknown_webhook', message: 'Unknown webhook.' }, 404);
        case 'inactive':
            return c.json({ code: 'webhook_inactive', message: 'Webhook is not active.' }, 410);
        case 'empty_payload':
            // Discord returns 400 "Cannot send an empty message".
            return c.json({ code: 'empty_payload', message: 'Cannot send an empty message.' }, 400);
        case 'matrix_failed':
            return c.json(
                { code: 'matrix_failed', message: out.reason ?? 'Forwarding to Matrix failed.' },
                502
            );
        default: {
            const exhaustive: never = out;
            return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
        }
    }
});

export { authedRouter, publicExecuteRouter };
export default authedRouter;
