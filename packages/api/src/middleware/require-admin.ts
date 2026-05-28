/**
 * WHAT THIS FILE DOES
 * The "bouncer at the door" for admin-only routes (refunding tips,
 * syncing revenue, capturing payments, etc.). When a route needs
 * admin access, it calls `requireAdmin(c)`. This function reads the
 * `x-admin-api-key` header from the request and checks it against
 * the `BLACKOUT_ADMIN_API_KEY` environment variable.
 *
 * WHY IT EXISTS (THE SECURITY PROBLEM)
 * Before this file existed, five different route files each had
 * their own copy of the admin check, and each one had this line:
 *   const expected = process.env.BLACKOUT_ADMIN_API_KEY ?? 'dev-admin-key';
 * If an operator forgot to set the environment variable, every admin
 * endpoint would accept the key 'dev-admin-key' — a value anyone
 * reading the source code could find. An attacker who learned this
 * default could call any admin route just by sending the header
 * `x-admin-api-key: dev-admin-key`.
 *
 * HOW IT WORKS
 * 1. At server startup: if production mode is detected and the env
 *    var is missing, the process CRASHES immediately — forcing the
 *    operator to set a real key before the server can start.
 * 2. In development: if no key is set, admin routes silently allow
 *    through (since dev has no sensitive data).
 * 3. At request time: the key is compared using `timingSafeEqual()`
 *    instead of `===` — see KEY CONCEPTS below.
 *
 * KEY CONCEPTS EXPLAINED
 * - Environment variable: A value stored outside the source code
 *   (in a .env file or system config). Keeps secrets like passwords
 *   and API keys out of version control where anyone could find them.
 * - timingSafeEqual: Normal string comparison (`a !== b`) STOPS at
 *   the first character that doesn't match. An attacker who can
 *   measure response times can guess the key one character at a time
 *   — like cracking a safe by listening for clicks. timingSafeEqual()
 *   compares EVERY byte before returning, making all attempts take
 *   the same time regardless of how many characters match.
 * - Defense in depth: Even though the key is protected by the env
 *   var, we ALSO protect it with constant-time comparison so that
 *   even if an attacker can measure network timing, they can't
 *   extract the key byte by byte.
 *
 * HOW TO VERIFY
 * 1. Start the API without BLACKOUT_ADMIN_API_KEY set → admin routes
 *    should work in dev mode (no key required).
 * 2. Set BLACKOUT_ADMIN_API_KEY=test-key, restart → admin routes
 *    should reject requests without the header or with the wrong key.
 * 3. Send x-admin-api-key: test-key → should be accepted.
 * 4. In production: set NODE_ENV=production without the key → server
 *    should crash at startup with a clear error message.
 */

import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';

// SECURITY: Read once at startup, never change. If this value is ''
// (unset), it means we're in dev mode and admin routes are open.
const ADMIN_API_KEY = process.env.BLACKOUT_ADMIN_API_KEY;

// SECURITY: Starts with 'prod' catches both 'production' and 'prod'.
// Matches Heroku, Render, Railway, and custom naming conventions.
const isProduction = (process.env.NODE_ENV ?? '').startsWith('prod');

// SECURITY: Production guard — crash early if the key is missing.
// Better to refuse to start than to start with no admin protection.
if (isProduction && !ADMIN_API_KEY) {
  throw new Error(
    'BLACKOUT_ADMIN_API_KEY is required in production. ' +
      'Set it to a cryptographically random string (e.g. openssl rand -hex 32).'
  );
}

export function requireAdmin(c: Context): true | Response {
  // Dev mode with no key configured: allow through.
  // In dev, there's no sensitive data to protect.
  if (!ADMIN_API_KEY) return true;

  const got = c.req.header('x-admin-api-key');
  if (!got) {
    return c.json({ code: 'forbidden', message: 'Admin API key required' }, 403);
  }

  // SECURITY: Convert both strings to Buffers and use timingSafeEqual
  // instead of !==. This prevents timing attacks where an attacker
  // measures how long the comparison takes to guess the key byte by
  // byte. If the lengths differ, we reject immediately (safe because
  // the attacker learns nothing about the key from a length mismatch).
  const expected = Buffer.from(ADMIN_API_KEY);
  const provided = Buffer.from(got);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return c.json({ code: 'forbidden', message: 'Admin API key required' }, 403);
  }
  return true;
}
