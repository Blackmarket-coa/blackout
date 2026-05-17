import type { PluginCapability, PluginManifest } from '@blackout/sdk';
import { PluginSandbox } from './PluginSandboxHost';
import { defaultHandlers } from './defaultHandlers';

const sandboxes = new Map<string, PluginSandbox>();
const bundleCache = new Map<string, Uint8Array>();

function buildSandbox(
    manifest: PluginManifest,
    bundleBytes: Uint8Array,
    grantedCapabilities: readonly PluginCapability[],
): PluginSandbox {
    const granted = new Set(grantedCapabilities);
    const effective = manifest.capabilities.filter((cap) => granted.has(cap));
    return new PluginSandbox({
        manifest: { ...manifest, capabilities: effective },
        bundleBytes,
        handlers: defaultHandlers(),
    });
}

export function mountSandbox(
    manifest: PluginManifest,
    bundleBytes: Uint8Array,
    grantedCapabilities: readonly PluginCapability[],
): PluginSandbox {
    unmountSandbox(manifest.id);
    const sandbox = buildSandbox(manifest, bundleBytes, grantedCapabilities);
    sandboxes.set(manifest.id, sandbox);
    bundleCache.set(manifest.id, bundleBytes);
    return sandbox;
}

export function unmountSandbox(pluginId: string): void {
    const existing = sandboxes.get(pluginId);
    if (!existing) return;
    existing.destroy();
    sandboxes.delete(pluginId);
    bundleCache.delete(pluginId);
}

export function getSandbox(pluginId: string): PluginSandbox | undefined {
    return sandboxes.get(pluginId);
}

/**
 * Re-mounts a running sandbox with a new effective capability set, reusing
 * the bundle bytes captured at install time. Returns `undefined` if the
 * plugin has never been mounted in this session (e.g. after a page reload
 * before the bundle has been re-fetched).
 */
export function remountSandbox(
    manifest: PluginManifest,
    grantedCapabilities: readonly PluginCapability[],
): PluginSandbox | undefined {
    const bytes = bundleCache.get(manifest.id);
    if (!bytes) return undefined;
    return mountSandbox(manifest, bytes, grantedCapabilities);
}
