/**
 * WHAT THIS FILE DOES
 * A "double lock" for the most dangerous admin operations: deactivating
 * users and purging rooms. Admin routes already require the admin API
 * key (from require-admin.ts). This middleware adds a SECOND check:
 * a short-lived JWT confirmation token that must be requested separately
 * before performing the destructive action.
 *
 * WHY IT EXISTS (THE SECURITY PROBLEM)
 * Without this, a leaked admin API key gives an attacker full power:
 * they can deactivate every user and purge every room in a single
 * script. With this middleware, even if the admin key is compromised,
 * the attacker needs to make two requests (request confirmation token
 * → perform action) and the token expires in 60 seconds. Each use is
 * logged to the structured logger with the admin's identity and a
 * unique JTI (JWT ID), creating an audit trail.
 *
 * HOW IT WORKS (STEP BY STEP)
 * 1. Admin calls POST /v1/admin/destructive-action/request with
 *    { action: 'deactivate_user', targetId: '...' }.
 * 2. Server returns a short-lived JWT (confirmToken) — valid 60s.
 * 3. Admin sends the JWT in the X-Destructive-Confirm header when
 *    calling the actual destructive endpoint.
 * 4. This middleware validates the JWT (signature, expiry), checks
 *    that the action and targetId match what was requested, and
 *    verifies that the JTI hasn't been used before (replay protection).
 * 5. The action is logged with admin user, target ID, and JTI.
 *
 * KEY CONCEPTS EXPLAINED
 * - JWT (JSON Web Token): A signed piece of data. Anyone can read it,
 *   but only the server (with the signing secret) can create one.
 *   Tampering is detectable because the signature won't match.
 * - JTI (JWT ID): A unique ID embedded in each JWT. By tracking
 *   which JTIs have been consumed, we prevent the same token from
 *   being used twice (replay attack protection).
 * - Defense in depth: Layering multiple security checks so that even
 *   if one fails, the others still protect you. The admin key is the
 *   first lock, this confirmation token is the second.
 * - Replay attack: Capturing a valid request and sending it again.
 *   The JTI tracking prevents this — each token can only be used once.
 *
 * HOW TO VERIFY
 * 1. Call POST /v1/admin/destructive-action/request → get confirmToken.
 * 2. Call the destructive endpoint WITHOUT the token → expect 403.
 * 3. Call with the token → expect success (or appropriate Matrix error).
 * 4. Call AGAIN with the same token → expect 403 (JTI already consumed).
 * 5. Wait 60+ seconds and call → expect 403 (token expired).
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

// SECURITY: Track consumed JTIs in-memory so the same confirmation
// token can't be reused. In a multi-process deployment, this would
// need to move to Redis. For single-process (our current setup),
// in-memory is sufficient.
const consumedJtis = new Set<string>();
const CONFIRM_MAX_TTL_MS = 300_000; // 5 minutes max

// SECURITY: Periodically clean the consumed set to prevent unbounded
// memory growth. JTIs expire naturally via TTL, but we prune old
// entries as a safety net.
setInterval(() => {
    if (consumedJtis.size > 10_000) consumedJtis.clear();
}, CONFIRM_MAX_TTL_MS);

export function requireDestructiveConfirm(
    c: Context,
    expectedAction: DestructiveAction,
    expectedTargetId: string
): true | Response {
    // Step 1: Require the token to be present
    const token = c.req.header('X-Destructive-Confirm') ?? '';
    if (!token) {
        return c.json(
            { code: 'confirm_required', message: 'Destructive actions require a confirmation token from POST /v1/admin/destructive-action/request' },
            403
        );
    }

    // Step 2: Verify the JWT signature and expiry
    const payload = verifyJwt(token) as DestructiveConfirmPayload | null;
    if (!payload || payload.purpose !== 'destructive-confirm') {
        return c.json({ code: 'invalid_confirm', message: 'Invalid or expired confirmation token' }, 403);
    }

    // Step 3: Check JTI hasn't been used before (replay protection)
    if (consumedJtis.has(payload.jti)) {
        return c.json({ code: 'confirm_replay', message: 'This confirmation token has already been used' }, 403);
    }
    consumedJtis.add(payload.jti);

    // Step 4: Verify the token authorizes THIS specific action + target
    if (payload.action !== expectedAction || payload.targetId !== expectedTargetId) {
        log.warn('destructive_confirm_mismatch', {
            expected: { action: expectedAction, targetId: expectedTargetId },
            received: { action: payload.action, targetId: payload.targetId },
        });
        return c.json({ code: 'confirm_mismatch', message: 'Confirmation token does not match the requested operation' }, 403);
    }

    // Step 5: Audit log — who did what, with which token, at what time
    log.warn('destructive_action_confirmed', {
        action: expectedAction,
        targetId: expectedTargetId,
        adminUser: payload.sub,
        confirmJti: payload.jti,
    });

    return true;
}
