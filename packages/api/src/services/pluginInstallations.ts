/**
 * Plugin install-scoping service (Phase 1).
 *
 * Separates ownership (marketplace entitlements, user-scoped) from
 * activation-at-scope (this module). An installation records that a plugin is
 * turned on at a User / Den / Coalition / Creator scope, with per-scope config
 * and an enable/disable lifecycle.
 *
 * Coalition installs use per-den opt-in: a coalition-scope install is stored
 * with status `available` and never auto-activates any den. Each den activates
 * by creating its own den-scope `enabled` installation. `pluginActiveInScope`
 * therefore only ever consults the exact-scope row — there is no inheritance.
 *
 * Authorization for Den/Coalition scopes is intentionally a Phase-1
 * placeholder built on the existing `reputationTier` signal; Phase 3 replaces
 * it with Matrix power-level / governance-vote wiring.
 */

import crypto from 'node:crypto';
import {
    isActiveInstallStatus,
    type InstallScope,
    type InstallScopeType,
    type InstallStatus,
    type PluginInstallation,
} from '@blackout/core';
import { db } from '../db/store';
import type { PluginInstallationRecord } from '../db/types';
import { getEntitlementById } from './marketplaceEntitlements';

/** Default-off gate. Flip `BLACKOUT_PLUGIN_INSTALL_SCOPES=true` to enable. */
export function pluginInstallScopesEnabled(): boolean {
    return process.env.BLACKOUT_PLUGIN_INSTALL_SCOPES === 'true';
}

const ENTITLEMENT_ACTIVE = new Set(['granted', 'pending']);

export interface InstallAuthorization {
    ok: boolean;
    /** Stable machine code for the route to map onto an HTTP status. */
    code:
        | 'ok'
        | 'scope_forbidden'
        | 'entitlement_required'
        | 'entitlement_not_owned'
        | 'entitlement_inactive';
    message: string;
}

function toModel(record: PluginInstallationRecord): PluginInstallation {
    return {
        id: record.id,
        pluginId: record.pluginId,
        entitlementId: record.entitlementId,
        scope: { type: record.scopeType, id: record.scopeId },
        installedByUserId: record.installedByUserId,
        status: record.status,
        artifactKind: record.artifactKind as PluginInstallation['artifactKind'],
        domain: (record.domain ?? undefined) as PluginInstallation['domain'],
        grantedCapabilities: record.grantedCapabilities,
        config: record.config,
        manifest: record.manifest,
        installedAt: record.installedAt,
        updatedAt: record.updatedAt,
    };
}

/**
 * Phase-1 scope authorization. User/Creator scopes must be self-owned;
 * Den/Coalition require an elevated reputation tier as a stand-in for the
 * real PL/governance checks that arrive in Phase 3.
 */
export function authorizeScope(
    userId: string,
    userReputationTier: string,
    scope: InstallScope,
): InstallAuthorization {
    switch (scope.type) {
        case 'user':
        case 'creator':
            if (scope.id !== userId) {
                return {
                    ok: false,
                    code: 'scope_forbidden',
                    message: 'You can only install plugins on your own scope.',
                };
            }
            return { ok: true, code: 'ok', message: '' };
        case 'den':
        case 'coalition':
            if (userReputationTier === 'coordinator' || userReputationTier === 'arbiter') {
                return { ok: true, code: 'ok', message: '' };
            }
            return {
                ok: false,
                code: 'scope_forbidden',
                message: 'Installing at this scope requires a coordinator or arbiter.',
            };
        default:
            return { ok: false, code: 'scope_forbidden', message: 'Unknown scope type.' };
    }
}

/** Ownership gate: a non-free install must reference an active entitlement the caller owns. */
export function authorizeEntitlement(
    userId: string,
    entitlementId: string | null,
    requiresEntitlement: boolean,
): InstallAuthorization {
    if (!entitlementId) {
        if (requiresEntitlement) {
            return {
                ok: false,
                code: 'entitlement_required',
                message: 'This plugin requires a purchase before it can be installed.',
            };
        }
        return { ok: true, code: 'ok', message: '' };
    }
    const entitlement = getEntitlementById(entitlementId);
    if (!entitlement || entitlement.userId !== userId) {
        return {
            ok: false,
            code: 'entitlement_not_owned',
            message: 'The referenced entitlement is not owned by you.',
        };
    }
    if (!ENTITLEMENT_ACTIVE.has(entitlement.status)) {
        return {
            ok: false,
            code: 'entitlement_inactive',
            message: `Entitlement is ${entitlement.status}; cannot install.`,
        };
    }
    return { ok: true, code: 'ok', message: '' };
}

export interface InstallPluginInput {
    pluginId: string;
    scope: InstallScope;
    installedByUserId: string;
    entitlementId?: string | null;
    artifactKind: string;
    domain?: string | null;
    grantedCapabilities?: string[];
    config?: Record<string, unknown>;
    manifest?: Record<string, unknown>;
    /** Coalition installs land as `available` (per-den opt-in); others `enabled`. */
    status?: InstallStatus;
}

/**
 * Idempotent on (pluginId, scope): re-installing updates the existing row
 * rather than creating a duplicate, so a re-enable after disable is clean.
 */
export function installPluginAtScope(input: InstallPluginInput): PluginInstallation {
    const status: InstallStatus =
        input.status ?? (input.scope.type === 'coalition' ? 'available' : 'enabled');
    const existing = db.findPluginInstallation(input.pluginId, input.scope.type, input.scope.id);
    if (existing) {
        const updated = db.updatePluginInstallation(existing.id, {
            entitlementId: input.entitlementId ?? existing.entitlementId,
            installedByUserId: input.installedByUserId,
            status,
            artifactKind: input.artifactKind,
            domain: input.domain ?? existing.domain,
            grantedCapabilities: input.grantedCapabilities ?? existing.grantedCapabilities,
            config: input.config ?? existing.config,
            manifest: input.manifest ?? existing.manifest,
        });
        return toModel(updated ?? existing);
    }
    const record = db.createPluginInstallation({
        id: crypto.randomUUID(),
        pluginId: input.pluginId,
        entitlementId: input.entitlementId ?? null,
        scopeType: input.scope.type,
        scopeId: input.scope.id,
        installedByUserId: input.installedByUserId,
        status,
        artifactKind: input.artifactKind,
        domain: input.domain ?? null,
        grantedCapabilities: input.grantedCapabilities ?? [],
        config: input.config ?? {},
        manifest: input.manifest ?? {},
    });
    return toModel(record);
}

export function setInstallationStatus(
    installationId: string,
    status: InstallStatus,
): PluginInstallation | undefined {
    const updated = db.updatePluginInstallation(installationId, { status });
    return updated ? toModel(updated) : undefined;
}

export function uninstall(installationId: string): boolean {
    return db.deletePluginInstallation(installationId);
}

export function getInstallation(installationId: string): PluginInstallation | undefined {
    const record = db.getPluginInstallation(installationId);
    return record ? toModel(record) : undefined;
}

export function listInstallationsForScope(scope: InstallScope): PluginInstallation[] {
    return db.listPluginInstallationsForScope(scope.type, scope.id).map(toModel);
}

export function listInstallationsForPlugin(pluginId: string): PluginInstallation[] {
    return db.listPluginInstallationsForPlugin(pluginId).map(toModel);
}

/**
 * The keystone read: is `pluginId` active in this exact scope? No inheritance —
 * a coalition's `available` row does not make the plugin active in any den.
 */
export function pluginActiveInScope(pluginId: string, scope: InstallScope): boolean {
    const row = db.findPluginInstallation(pluginId, scope.type, scope.id);
    return row ? isActiveInstallStatus(row.status) : false;
}

/**
 * Plugins a coalition has made available to its member dens (per-den opt-in
 * source list). A den client uses this to render an "available to enable"
 * shelf distinct from what it has already activated.
 */
export function listCoalitionAvailablePlugins(coalitionId: string): PluginInstallation[] {
    return db
        .listPluginInstallationsForScope('coalition', coalitionId)
        .filter((row) => row.status === 'available' || row.status === 'enabled')
        .map(toModel);
}

export function isInstallScopeOwnedByUser(scope: InstallScope, userId: string): boolean {
    return (scope.type === 'user' || scope.type === 'creator') && scope.id === userId;
}

export type { InstallScopeType };
