import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { appActions, appEvents } from '@blackout/core';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import {
    getIntegrationContract,
    getObservability,
    getWorkflowTemplate,
    installApp,
    listDirectory,
    listInstallations,
    listWorkflowTemplates,
    recordActionExecution,
    revokeApp,
} from '../services/apps';
import { canopyAdminRefusalResponse, checkCanopyAdmin } from '../services/canopyListingGate';

/**
 * Installing an app in a canopy, revoking it, and recording an action run there
 * (which counts against the installation's quota and error tally) all change
 * that canopy's installation record, so each takes a session and the caller's
 * standing as an admin of the canopy on the homeserver: the standing that
 * listing the canopy takes (`services/canopyListingGate.ts`), read the same way
 * and refused the same way, including when the homeserver cannot answer. An
 * install grants the app scopes up to `roles:write` and `moderation:write`;
 * only an admin can change a canopy's power levels, so no lesser role may grant
 * them, and a revoke or an action record acts on the same record. Until
 * 2026-10-26 these routes checked no session at all (F5 in
 * docs/security/api-findings-triage-2026-10-25.md).
 *
 * The check runs before the app or the canopy is looked up, so a caller who is
 * not an admin of a canopy gets the same answer whether it is listed or not.
 */
const NOT_CANOPY_ADMIN = 'Only an admin of this canopy can install, revoke or run its apps.';

const refuseUnlessCanopyAdmin = async (
    c: Context,
    userId: string,
    canopyId: string
): Promise<Response | null> => {
    const verdict = await checkCanopyAdmin(userId, canopyId);
    if (verdict.ok) return null;
    const { status, body } = canopyAdminRefusalResponse(verdict.reason, NOT_CANOPY_ADMIN);
    return c.json(body, status);
};

const apps = new Hono();

const installAppSchema = z.object({
    canopyId: z.string().min(1),
    permissions: z.array(z.string()).optional(),
});

const revokeAppSchema = z.object({ canopyId: z.string().min(1) });

const recordActionSchema = z.object({
    appId: z.string().min(1),
    canopyId: z.string().min(1),
    latencyMs: z.number().optional(),
    failed: z.boolean().optional(),
});

apps.get('/contract', (c) => c.json(getIntegrationContract()));

apps.get('/events', (c) => c.json({ events: appEvents }));
apps.get('/actions', (c) => c.json({ actions: appActions }));

apps.get('/directory', (c) => {
    const canopyId = c.req.query('canopyId');
    return c.json({ apps: listDirectory(), installations: listInstallations(canopyId) });
});

apps.post('/directory/:appId/install', async (c) => {
    const user = requireUser(c, 'Sign in to install an app');
    if (user instanceof Response) return user;
    const appId = c.req.param('appId');
    const parsed = await readJsonBody(c, installAppSchema);
    if (parsed instanceof Response) return parsed;
    const refused = await refuseUnlessCanopyAdmin(c, user.sub, parsed.canopyId);
    if (refused) return refused;
    const result = installApp({
        appId,
        canopyId: parsed.canopyId,
        permissions: parsed.permissions,
    });
    if (!result.ok) {
        if (result.code === 'app_not_found') return c.json(result, 404);
        if (result.code === 'policy_denied') return c.json(result, 403);
        return c.json(result, 400);
    }
    return c.json(result, 201);
});

apps.post('/directory/:appId/revoke', async (c) => {
    const user = requireUser(c, 'Sign in to revoke an app');
    if (user instanceof Response) return user;
    const appId = c.req.param('appId');
    const parsed = await readJsonBody(c, revokeAppSchema);
    if (parsed instanceof Response) return parsed;
    const refused = await refuseUnlessCanopyAdmin(c, user.sub, parsed.canopyId);
    if (refused) return refused;
    const result = revokeApp(appId, parsed.canopyId);
    if (!result.ok) return c.json(result, 404);
    return c.json(result, 200);
});

apps.get('/directory/:appId/observability', (c) => {
    const appId = c.req.param('appId');
    const canopyId = c.req.query('canopyId');
    if (!canopyId) {
        return c.json({ code: 'invalid_request', message: 'canopyId query is required' }, 400);
    }
    const metrics = getObservability(appId, canopyId);
    if (!metrics) return c.json({ code: 'install_not_found' }, 404);
    return c.json({ metrics });
});

apps.post('/actions/:action', async (c) => {
    const user = requireUser(c, 'Sign in to run an app action');
    if (user instanceof Response) return user;
    const action = c.req.param('action');
    const parsed = await readJsonBody(c, recordActionSchema);
    if (parsed instanceof Response) return parsed;
    const refused = await refuseUnlessCanopyAdmin(c, user.sub, parsed.canopyId);
    if (refused) return refused;
    const result = recordActionExecution({
        appId: parsed.appId,
        canopyId: parsed.canopyId,
        action,
        latencyMs: parsed.latencyMs ?? 10,
        failed: parsed.failed,
    });
    if (!result.ok) {
        if (result.code === 'quota_exceeded') return c.json(result, 429);
        if (result.code === 'app_not_installed') return c.json(result, 404);
        return c.json(result, 400);
    }
    return c.json(result, 200);
});

apps.get('/workflows/n8n/templates', (c) => {
    return c.json({ templates: listWorkflowTemplates() });
});

apps.get('/workflows/n8n/templates/:templateId', (c) => {
    const template = getWorkflowTemplate(c.req.param('templateId'));
    if (!template) return c.json({ code: 'template_not_found' }, 404);
    return c.json({ template });
});

export default apps;
