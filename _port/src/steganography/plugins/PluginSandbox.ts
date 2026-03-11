/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

export type PluginCapability = "encode" | "decode" | "render" | "transform";
export type PluginNetworkPolicy = "none" | "approved_background";
export type PluginPermissionState = "prompt" | "granted" | "denied";

export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    capabilities: PluginCapability[];
    networkPolicy?: PluginNetworkPolicy;
}

export interface PluginPermissionSnapshot {
    pluginId: string;
    network: PluginPermissionState;
}

export interface PluginHooks {
    encode?(payload: Uint8Array): Uint8Array;
    decode?(payload: Uint8Array): Uint8Array;
    render?(input: string): string;
    transform?(input: string): string;
}

export interface PluginNetworkRequest {
    url: string;
    method?: string;
    body?: string;
}

export interface PluginSandboxOptions {
    approvedNetworkOrigins?: string[];
}

export interface PluginNetworkResponse {
    status: number;
    body: string;
}

export interface PluginExecutionContext {
    requestNetwork(request: PluginNetworkRequest): PluginNetworkResponse;
}

export interface PluginModule extends PluginHooks {
    onLoad?(context: PluginExecutionContext): void;
}

export interface PluginRegistration {
    manifest: PluginManifest;
    module: PluginModule;
}

interface RegisteredPlugin {
    manifest: PluginManifest;
    module: PluginModule;
    context: PluginExecutionContext;
}

function hasCapabilityHook(module: PluginModule, capability: PluginCapability): boolean {
    switch (capability) {
        case "encode":
            return typeof module.encode === "function";
        case "decode":
            return typeof module.decode === "function";
        case "render":
            return typeof module.render === "function";
        case "transform":
            return typeof module.transform === "function";
    }
}

export class PluginSandboxConformanceError extends Error {}

export class PluginSandboxRuntime {
    private readonly approvedNetworkOrigins: Set<string>;
    private readonly plugins = new Map<string, RegisteredPlugin>();
    private readonly permissionStore = new Map<string, PluginPermissionSnapshot>();

    public constructor(options: PluginSandboxOptions = {}) {
        this.approvedNetworkOrigins = new Set(options.approvedNetworkOrigins ?? []);
    }

    public registerPlugin(registration: PluginRegistration): void {
        const { manifest, module } = registration;
        this.assertManifestConformance(manifest, module);

        const permissionSnapshot: PluginPermissionSnapshot = {
            pluginId: manifest.id,
            network: manifest.networkPolicy === "approved_background" ? "prompt" : "denied",
        };

        this.permissionStore.set(manifest.id, permissionSnapshot);

        const context = this.createExecutionContext(manifest.id);
        this.plugins.set(manifest.id, { manifest, module, context });
        module.onLoad?.(context);
    }

    public listPlugins(): PluginManifest[] {
        return [...this.plugins.values()].map(({ manifest }) => manifest);
    }

    public getPermissionSnapshot(pluginId: string): PluginPermissionSnapshot {
        const snapshot = this.permissionStore.get(pluginId);
        if (!snapshot) {
            throw new Error(`Unknown plugin: ${pluginId}`);
        }

        return { ...snapshot };
    }

    public grantNetworkPermission(pluginId: string): PluginPermissionSnapshot {
        return this.setNetworkPermission(pluginId, "granted");
    }

    public denyNetworkPermission(pluginId: string): PluginPermissionSnapshot {
        return this.setNetworkPermission(pluginId, "denied");
    }

    public revokeNetworkPermission(pluginId: string): PluginPermissionSnapshot {
        return this.setNetworkPermission(pluginId, "denied");
    }

    public executeEncode(pluginId: string, payload: Uint8Array): Uint8Array {
        const plugin = this.getRegisteredPlugin(pluginId, "encode");
        return plugin.module.encode!(payload);
    }

    public executeDecode(pluginId: string, payload: Uint8Array): Uint8Array {
        const plugin = this.getRegisteredPlugin(pluginId, "decode");
        return plugin.module.decode!(payload);
    }

    public executeRender(pluginId: string, input: string): string {
        const plugin = this.getRegisteredPlugin(pluginId, "render");
        return plugin.module.render!(input);
    }

    public executeTransform(pluginId: string, input: string): string {
        const plugin = this.getRegisteredPlugin(pluginId, "transform");
        return plugin.module.transform!(input);
    }

    public runPluginNetworkRequest(pluginId: string, request: PluginNetworkRequest): PluginNetworkResponse {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Unknown plugin: ${pluginId}`);
        }

        return plugin.context.requestNetwork(request);
    }

    private getRegisteredPlugin(pluginId: string, capability: PluginCapability): RegisteredPlugin {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Unknown plugin: ${pluginId}`);
        }

        if (!plugin.manifest.capabilities.includes(capability) || !hasCapabilityHook(plugin.module, capability)) {
            throw new Error(`Plugin ${pluginId} does not implement capability: ${capability}`);
        }

        return plugin;
    }

    private setNetworkPermission(pluginId: string, state: PluginPermissionState): PluginPermissionSnapshot {
        const snapshot = this.permissionStore.get(pluginId);
        const plugin = this.plugins.get(pluginId);
        if (!snapshot || !plugin) {
            throw new Error(`Unknown plugin: ${pluginId}`);
        }

        if (plugin.manifest.networkPolicy !== "approved_background") {
            throw new PluginSandboxConformanceError(
                `Plugin ${pluginId} requested network permission changes but is declared as networkPolicy=none`,
            );
        }

        const updated = { ...snapshot, network: state };
        this.permissionStore.set(pluginId, updated);
        return updated;
    }

    private createExecutionContext(pluginId: string): PluginExecutionContext {
        return {
            requestNetwork: (request) => {
                const permission = this.getPermissionSnapshot(pluginId);
                if (permission.network !== "granted") {
                    throw new PluginSandboxConformanceError(
                        `Plugin ${pluginId} attempted network access without granted permission`,
                    );
                }

                if (!this.isApprovedHttpOrigin(request.url)) {
                    throw new PluginSandboxConformanceError(
                        `Plugin ${pluginId} attempted disallowed network target: ${request.url}`,
                    );
                }

                return { status: 204, body: "network_request_recorded" };
            },
        };
    }

    private isApprovedHttpOrigin(urlString: string): boolean {
        const url = new URL(urlString);
        if (url.protocol !== "https:") {
            return false;
        }

        if (this.approvedNetworkOrigins.size === 0) {
            return false;
        }

        return this.approvedNetworkOrigins.has(url.origin);
    }

    private assertManifestConformance(manifest: PluginManifest, module: PluginModule): void {
        if (!manifest.id || !manifest.version || !manifest.name) {
            throw new PluginSandboxConformanceError("Plugin manifest must include id, name, and version");
        }

        if (manifest.capabilities.length === 0) {
            throw new PluginSandboxConformanceError("Plugin manifest must declare at least one capability");
        }

        for (const capability of manifest.capabilities) {
            if (!hasCapabilityHook(module, capability)) {
                throw new PluginSandboxConformanceError(
                    `Plugin ${manifest.id} is missing required implementation for capability: ${capability}`,
                );
            }
        }

        if (!manifest.networkPolicy) {
            manifest.networkPolicy = "none";
        }
    }
}
