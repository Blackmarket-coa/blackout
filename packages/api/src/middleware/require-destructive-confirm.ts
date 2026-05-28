/**
 * Destructive-action confirmation middleware.
 *
 * Requires a short-lived JWT (`X-Destructive-Confirm` header) before allowing
 * irreversible admin operations (user deactivation, room purge). The token
 * must be obtained from POST /v1/admin/destructive-action/request and is valid
 * for the configured TTL (default 60 seconds).
 *
 * This provides defense-in-depth: even if the admin API key is compromised,
 * destructive operations still require a time-limited confirmation step that
 * is logged to the audit trail.
 */

import type { Context, Next } from 'hono';
import { readAuthRuntimeConfig, verifyJwt } from '../services/auth';
import { log } from '../telemetry/logger';

export interface DestructiveConfirmPayload {
    sub: string;
    purpose: 'destructive-confirm';
    action: string;
    targetId: string;
    iat: number;
    exp: number;
    jti: string;
}

export type DestructiveAction = 'deactivate_user' | 'purge_room';

export function requireDestructiveConfirm(
    c: Context,
    expectedAction: DestructiveAction,
    expectedTargetId: string
): true | Response {
    const token = c.req.header('X-Destructive-Confirm') ?? '';
    if (!token) {
        return c.json(
            { code: 'confirm_required', message: 'Destructive actions require a confirmation token from POST /v1/admin/destructive-action/request' },
            403
        );
    }

    const payload = verifyJwt(token) as DestructiveConfirmPayload | null;
    if (!payload || payload.purpose !== 'destructive-confirm') {
        return c.json({ code: 'invalid_confirm', message: 'Invalid or expired confirmation token' }, 403);
    }

    if (payload.action !== expectedAction || payload.targetId !== expectedTargetId) {
        log.warn('destructive_confirm_mismatch', {
            expected: { action: expectedAction, targetId: expectedTargetId },
            received: { action: payload.action, targetId: payload.targetId },
        });
        return c.json({ code: 'confirm_mismatch', message: 'Confirmation token does not match the requested operation' }, 403);
    }

    log.warn('destructive_action_confirmed', {
        action: expectedAction,
        targetId: expectedTargetId,
        adminUser: payload.sub,
        confirmJti: payload.jti,
    });

    return true;
}
