/**
 * Plugin install-scoping model.
 *
 * Ownership and activation are deliberately separate concerns:
 *   • ownership   — a marketplace entitlement (who paid / is allowed to install).
 *                   User-scoped; lives in `marketplace_entitlements`.
 *   • activation  — a PluginInstallation: where a plugin is turned on, with
 *                   per-scope config and enable/disable. An installation
 *                   references the entitlement that authorizes it (or null for
 *                   free / in-tree plugins).
 *
 * Scopes form the four install levels from the product vision: a user's own
 * profile/tools, a den (discussion space), a coalition (community), and a
 * creator surface (streams/storefront).
 *
 * Coalition installs use per-den opt-in: a coalition-scope install makes a
 * plugin `available` to the coalition's dens, but each den must create its own
 * den-scope `enabled` installation to actually activate it. Nothing
 * auto-activates from coalition down to dens.
 */

import type { CreatorArtifactKind } from './creator';
import type { PluginDomain } from './domain';

export const INSTALL_SCOPE_TYPES = ['user', 'den', 'coalition', 'creator'] as const;
export type InstallScopeType = (typeof INSTALL_SCOPE_TYPES)[number];

export interface InstallScope {
    type: InstallScopeType;
    /** userId | denId (matrix room id) | coalitionId | creatorId. */
    id: string;
}

export const INSTALL_STATUSES = [
    'enabled',
    'disabled',
    /** Coalition-scope only: offered to member dens, not active anywhere yet. */
    'available',
    'pending',
    'error',
] as const;
export type InstallStatus = (typeof INSTALL_STATUSES)[number];

export interface PluginInstallation {
    id: string;
    pluginId: string;
    /** Entitlement that authorizes this install; null for free / in-tree plugins. */
    entitlementId: string | null;
    scope: InstallScope;
    installedByUserId: string;
    status: InstallStatus;
    artifactKind: CreatorArtifactKind;
    domain?: PluginDomain;
    /**
     * Capabilities the installer granted (subset of the manifest's declared
     * set). Kept as plain strings here so core stays decoupled from the
     * protocol/SDK `PluginCapability` union.
     */
    grantedCapabilities: string[];
    /** Per-scope plugin configuration. */
    config: Record<string, unknown>;
    /** Cached manifest snapshot at install time. */
    manifest: Record<string, unknown>;
    installedAt: string;
    updatedAt: string;
}

export function isInstallScopeType(value: unknown): value is InstallScopeType {
    return typeof value === 'string' && (INSTALL_SCOPE_TYPES as readonly string[]).includes(value);
}

export function isInstallStatus(value: unknown): value is InstallStatus {
    return typeof value === 'string' && (INSTALL_STATUSES as readonly string[]).includes(value);
}

/** A status counts as "active in this exact scope" only when explicitly enabled. */
export function isActiveInstallStatus(status: InstallStatus): boolean {
    return status === 'enabled';
}
