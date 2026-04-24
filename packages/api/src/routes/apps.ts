import { Hono } from 'hono';
import { appActions, appEvents } from '@blackout/core';
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

const apps = new Hono();

apps.get('/contract', (c) => c.json(getIntegrationContract()));

apps.get('/events', (c) => c.json({ events: appEvents }));
apps.get('/actions', (c) => c.json({ actions: appActions }));

apps.get('/directory', (c) => {
  const canopyId = c.req.query('canopyId');
  return c.json({ apps: listDirectory(), installations: listInstallations(canopyId) });
});

apps.post('/directory/:appId/install', async (c) => {
  const appId = c.req.param('appId');
  const body = await c.req.json<{ canopyId?: string; permissions?: string[] }>();
  if (!body.canopyId) {
    return c.json({ code: 'invalid_request', message: 'canopyId is required' }, 400);
  }
  const result = installApp({ appId, canopyId: body.canopyId, permissions: body.permissions });
  if (!result.ok) {
    if (result.code === 'app_not_found') return c.json(result, 404);
    if (result.code === 'policy_denied') return c.json(result, 403);
    return c.json(result, 400);
  }
  return c.json(result, 201);
});

apps.post('/directory/:appId/revoke', async (c) => {
  const appId = c.req.param('appId');
  const body = await c.req.json<{ canopyId?: string }>();
  if (!body.canopyId) {
    return c.json({ code: 'invalid_request', message: 'canopyId is required' }, 400);
  }
  const result = revokeApp(appId, body.canopyId);
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
  const action = c.req.param('action');
  const body = await c.req.json<{ appId?: string; canopyId?: string; latencyMs?: number; failed?: boolean }>();
  if (!body.appId || !body.canopyId) {
    return c.json({ code: 'invalid_request', message: 'appId and canopyId are required' }, 400);
  }
  const result = recordActionExecution({
    appId: body.appId,
    canopyId: body.canopyId,
    action,
    latencyMs: body.latencyMs ?? 10,
    failed: body.failed,
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
