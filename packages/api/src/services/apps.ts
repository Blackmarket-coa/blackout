import {
  appActions,
  appEvents,
  appScopes,
  defaultIntegrationContract,
  type AppActionType,
  type AppEventType,
  type InstallState,
} from '@blackout/core';

export interface AppDirectoryEntry {
  id: string;
  name: string;
  description: string;
  verified: boolean;
  oauthRequired: boolean;
  defaultScopes: readonly (typeof appScopes)[number][];
  requestedEvents: readonly AppEventType[];
  supportedActions: readonly AppActionType[];
  sandboxProfile: 'strict' | 'balanced';
}

export interface AppInstallRecord {
  appId: string;
  canopyId: string;
  permissions: readonly (typeof appScopes)[number][];
  status: InstallState;
  installedAt: string;
  revokedAt?: string;
}

interface AppMetrics {
  appId: string;
  canopyId: string;
  errorCount: number;
  requestCount: number;
  latencyP95Ms: number;
  quotaUsed: number;
  quotaLimit: number;
  lastErrorAt?: string;
}

const directory: AppDirectoryEntry[] = [
  {
    id: 'welcome-ops',
    name: 'WelcomeOps',
    description: 'Onboards new members with welcome flows and role routing.',
    verified: true,
    oauthRequired: true,
    defaultScopes: ['members:read', 'messages:write', 'roles:write'],
    requestedEvents: ['member_joined'],
    supportedActions: ['post_message', 'assign_role'],
    sandboxProfile: 'strict',
  },
  {
    id: 'mod-escalator',
    name: 'ModEscalator',
    description: 'Escalates reports to mods with policy-based workflows.',
    verified: true,
    oauthRequired: true,
    defaultScopes: ['reports:read', 'moderation:write', 'messages:write'],
    requestedEvents: ['report_created', 'message_created'],
    supportedActions: ['moderate_user', 'post_message'],
    sandboxProfile: 'balanced',
  },
];

const installs = new Map<string, AppInstallRecord>();
const metrics = new Map<string, AppMetrics>();

function installKey(appId: string, canopyId: string): string {
  return `${appId}:${canopyId}`;
}

function ensureMetrics(appId: string, canopyId: string): AppMetrics {
  const key = installKey(appId, canopyId);
  const existing = metrics.get(key);
  if (existing) return existing;
  const created: AppMetrics = {
    appId,
    canopyId,
    errorCount: 0,
    requestCount: 0,
    latencyP95Ms: 0,
    quotaUsed: 0,
    quotaLimit: defaultIntegrationContract.rateLimits.actionsEgress.sustained,
  };
  metrics.set(key, created);
  return created;
}

export function getIntegrationContract() {
  return defaultIntegrationContract;
}

export function listDirectory() {
  return directory;
}

export function listInstallations(canopyId?: string) {
  const values = [...installs.values()];
  return canopyId ? values.filter((entry) => entry.canopyId === canopyId) : values;
}

export function installApp(input: { appId: string; canopyId: string; permissions?: readonly string[] }) {
  const app = directory.find((entry) => entry.id === input.appId);
  if (!app) return { ok: false as const, code: 'app_not_found' };

  const requested = (input.permissions?.length ? input.permissions : app.defaultScopes) as readonly string[];
  const unknownPermission = requested.find((scope) => !(appScopes as readonly string[]).includes(scope));
  if (unknownPermission) {
    return { ok: false as const, code: 'invalid_scope', scope: unknownPermission };
  }

  if (app.sandboxProfile === 'strict' && requested.includes('canopy:write')) {
    return { ok: false as const, code: 'policy_denied', reason: 'strict profile blocks canopy:write' };
  }

  const now = new Date().toISOString();
  const record: AppInstallRecord = {
    appId: app.id,
    canopyId: input.canopyId,
    permissions: requested as AppInstallRecord['permissions'],
    status: 'active',
    installedAt: now,
  };
  installs.set(installKey(app.id, input.canopyId), record);
  ensureMetrics(app.id, input.canopyId);
  return { ok: true as const, install: record };
}

export function revokeApp(appId: string, canopyId: string) {
  const key = installKey(appId, canopyId);
  const existing = installs.get(key);
  if (!existing) return { ok: false as const, code: 'install_not_found' };
  const revoked: AppInstallRecord = { ...existing, status: 'revoked', revokedAt: new Date().toISOString() };
  installs.set(key, revoked);
  return { ok: true as const, install: revoked };
}

export function recordActionExecution(input: {
  appId: string;
  canopyId: string;
  action: string;
  latencyMs: number;
  failed?: boolean;
}) {
  if (!(appActions as readonly string[]).includes(input.action)) {
    return { ok: false as const, code: 'unsupported_action' };
  }
  const install = installs.get(installKey(input.appId, input.canopyId));
  if (!install || install.status !== 'active') {
    return { ok: false as const, code: 'app_not_installed' };
  }

  const m = ensureMetrics(input.appId, input.canopyId);
  m.requestCount += 1;
  m.quotaUsed += 1;
  m.latencyP95Ms = Math.round((m.latencyP95Ms * 0.8) + (input.latencyMs * 0.2));
  if (input.failed) {
    m.errorCount += 1;
    m.lastErrorAt = new Date().toISOString();
  }

  if (m.quotaUsed > m.quotaLimit) {
    return { ok: false as const, code: 'quota_exceeded', metrics: m };
  }

  return { ok: true as const, metrics: m };
}

export function getObservability(appId: string, canopyId: string) {
  const install = installs.get(installKey(appId, canopyId));
  if (!install) return null;
  return ensureMetrics(appId, canopyId);
}

export function listWorkflowTemplates() {
  return [
    {
      id: 'welcome-flow-v1',
      name: 'Welcome flow',
      description: 'Trigger on member_joined and post onboarding messages + role assignment.',
      provider: 'n8n',
      triggers: ['member_joined'],
      actions: ['post_message', 'assign_role'],
    },
    {
      id: 'moderation-escalation-v1',
      name: 'Moderation escalation',
      description: 'Trigger on report_created and escalate severe incidents to moderators.',
      provider: 'n8n',
      triggers: ['report_created', 'message_created'],
      actions: ['moderate_user', 'post_message'],
    },
    {
      id: 'role-sync-v1',
      name: 'Role sync',
      description: 'Sync external CRM tags to canopy roles on join and profile updates.',
      provider: 'n8n',
      triggers: ['member_joined'],
      actions: ['assign_role'],
    },
  ] as const;
}

export function getWorkflowTemplate(id: string) {
  const template = listWorkflowTemplates().find((entry) => entry.id === id);
  if (!template) return null;
  return {
    ...template,
    n8nTemplate: {
      nodes: [
        { type: 'blackout.trigger', event: template.triggers[0] ?? appEvents[0] },
        { type: 'blackout.action', action: template.actions[0] ?? appActions[0] },
      ],
    },
  };
}
