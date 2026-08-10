import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { exportRateLimit } from '../middleware/rate-limit';
import { buildDataExport, dataExportFilename } from '../services/dataExport';

/**
 * Self-service data export — `GET /v1/data-export`.
 *
 * Free at every tier, by design. Blackout already had an export
 * (`GET /v1/transparency/audit-export`), but it returns HTTP 402 below the
 * Coalition tier, so most users had no way to get their own data at all. A
 * paywalled export cannot support a data-portability claim, so this surface is
 * ungated and stays that way — see `docs/legal/policy-change-process.md`.
 *
 * The two coexist rather than one replacing the other: `audit-export` remains a
 * tiered org-scoped capability, while this is the personal export every user
 * gets. Nothing here consults an entitlement, and nothing should start to.
 *
 * Rate-limited per authenticated user (`exportRateLimit`) because each call
 * scans every user-scoped table. The limiter is not fail-closed: a Redis outage
 * should not stand between someone and their own data.
 */
const dataExport = new Hono();

dataExport.use('/*', exportRateLimit);

/**
 * `?download=1` sets a `content-disposition` attachment header so a browser
 * saves the file instead of rendering it. Omitted by default so the endpoint
 * stays pleasant to inspect with curl.
 */
dataExport.get('/', async (c) => {
    const user = requireUser(c, 'Sign in to export your data');
    if (user instanceof Response) return user;

    const payload = await buildDataExport(user.sub, user.username);
    if (!payload) {
        // The JWT verified but the account is gone — mid-deletion, or a token
        // outliving its user. Not a 401: the caller authenticated fine.
        return c.json({ code: 'user_not_found', message: 'Account no longer exists' }, 404);
    }

    if (c.req.query('download') !== undefined) {
        c.header(
            'content-disposition',
            `attachment; filename="${dataExportFilename(user.sub, payload.manifest.generatedAt)}"`
        );
    }
    // Exports are per-user and change constantly; never let a shared cache hold one.
    c.header('cache-control', 'no-store');

    return c.json(payload);
});

export default dataExport;
