import { Hono } from 'hono';
import { isInstallScopeType, isInstallStatus, type InstallScope } from '@blackout/core';
import { requireUser } from '../middleware/require-user';
import { db } from '../db/store';
import {
    authorizeEntitlement,
    authorizeScope,
    getInstallation,
    installPluginAtScope,
    listCoalitionAvailablePlugins,
    listInstallationsForScope,
    pluginActiveInScope,
    pluginInstallScopesEnabled,
    setInstallationStatus,
    uninstall,
} from '../services/pluginInstallations';

const pluginInstallations = new Hono();

// Map a service authorization code onto an HTTP status.
function statusForAuthCode(code: string): 403 | 402 {
    return code === 'entitlement_required' ? 402 : 403;
}

function readScope(type: unknown, id: unknown): InstallScope | null {
    if (!isInstallScopeType(type) || typeof id !== 'string' || id.length === 0) return null;
    return { type, id };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Every route is hard-gated behind the default-off flag.
pluginInstallations.use('*', async (c, next) => {
    if (!pluginInstallScopesEnabled()) {
        return c.json({ code: 'feature_disabled', message: 'Plugin install scopes are not enabled.' }, 404);
    }
    await next();
});

pluginInstallations.get('/', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const scope = readScope(c.req.query('scopeType'), c.req.query('scopeId'));
    if (!scope) {
        return c.json({ code: 'invalid_scope', message: 'scopeType and scopeId are required.' }, 400);
    }
    return c.json({ installations: listInstallationsForScope(scope) });
});

pluginInstallations.get('/active', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const pluginId = c.req.query('pluginId');
    const scope = readScope(c.req.query('scopeType'), c.req.query('scopeId'));
    if (!pluginId || !scope) {
        return c.json({ code: 'invalid_request', message: 'pluginId, scopeType and scopeId are required.' }, 400);
    }
    return c.json({ active: pluginActiveInScope(pluginId, scope) });
});

pluginInstallations.get('/coalition/:coalitionId/available', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const coalitionId = c.req.param('coalitionId');
    return c.json({ installations: listCoalitionAvailablePlugins(coalitionId) });
});

pluginInstallations.post('/', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const raw = await c.req.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
        return c.json({ code: 'invalid_body', message: 'JSON body required.' }, 400);
    }
    const body = raw as Record<string, unknown>;
    const scopeInput = (body.scope ?? {}) as Record<string, unknown>;
    const scope = readScope(scopeInput.type, scopeInput.id);
    const { pluginId, artifactKind } = body;
    if (typeof pluginId !== 'string' || !pluginId || typeof artifactKind !== 'string' || !scope) {
        return c.json({ code: 'invalid_body', message: 'pluginId, artifactKind, and a valid scope are required.' }, 400);
    }

    const reputationTier = db.getUserById(user.sub)?.reputationTier ?? 'member';
    const scopeAuth = authorizeScope(user.sub, reputationTier, scope);
    if (!scopeAuth.ok) {
        return c.json({ code: scopeAuth.code, message: scopeAuth.message }, statusForAuthCode(scopeAuth.code));
    }

    const entitlementId = typeof body.entitlementId === 'string' ? body.entitlementId : null;
    const entAuth = authorizeEntitlement(user.sub, entitlementId, body.requiresEntitlement === true);
    if (!entAuth.ok) {
        return c.json({ code: entAuth.code, message: entAuth.message }, statusForAuthCode(entAuth.code));
    }

    const installation = installPluginAtScope({
        pluginId,
        scope,
        installedByUserId: user.sub,
        entitlementId,
        artifactKind,
        domain: typeof body.domain === 'string' ? body.domain : null,
        grantedCapabilities: Array.isArray(body.grantedCapabilities)
            ? body.grantedCapabilities.filter((x): x is string => typeof x === 'string')
            : [],
        config: isRecord(body.config) ? body.config : {},
        manifest: isRecord(body.manifest) ? body.manifest : {},
    });
    return c.json({ installation }, 201);
});

pluginInstallations.patch('/:id', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param('id');
    const existing = getInstallation(id);
    if (!existing) {
        return c.json({ code: 'not_found', message: 'Installation not found.' }, 404);
    }
    const reputationTier = db.getUserById(user.sub)?.reputationTier ?? 'member';
    const scopeAuth = authorizeScope(user.sub, reputationTier, existing.scope);
    if (!scopeAuth.ok) {
        return c.json({ code: scopeAuth.code, message: scopeAuth.message }, statusForAuthCode(scopeAuth.code));
    }
    const body = await c.req.json().catch(() => null);
    const status = (body as Record<string, unknown> | null)?.status;
    if (!isInstallStatus(status)) {
        return c.json({ code: 'invalid_status', message: 'A valid status is required.' }, 400);
    }
    const updated = setInstallationStatus(id, status);
    return c.json({ installation: updated });
});

pluginInstallations.delete('/:id', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param('id');
    const existing = getInstallation(id);
    if (!existing) {
        return c.json({ code: 'not_found', message: 'Installation not found.' }, 404);
    }
    const reputationTier = db.getUserById(user.sub)?.reputationTier ?? 'member';
    const scopeAuth = authorizeScope(user.sub, reputationTier, existing.scope);
    if (!scopeAuth.ok) {
        return c.json({ code: scopeAuth.code, message: scopeAuth.message }, statusForAuthCode(scopeAuth.code));
    }
    uninstall(id);
    return c.json({ ok: true });
});

export default pluginInstallations;
