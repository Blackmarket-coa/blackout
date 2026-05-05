import type { NormalizedEntitlement } from '@blackout/core';
import type { PluginManifest, SignedPluginBundle } from '@blackout/sdk';
import {
    registerDynamicFeaturePlugin,
    unregisterDynamicFeaturePlugin,
} from '../../../core/features/plugins';
import type { FeatureModulePlugin } from '../../../core/features/types';
import type {
    InstalledPluginRecord,
    InstalledPluginStatus,
} from './installedPluginsAtom';
import { verifySignedBundle } from './pluginSignature';

export interface InstallContext {
    fetchSignedBundle: (entitlementId: string) => Promise<SignedPluginBundle>;
    onAssetCached?: (manifest: PluginManifest, bytes: Uint8Array) => void;
    onCodePluginLoaded?: (manifest: PluginManifest, bytes: Uint8Array) => void;
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
}

function manifestPluginToFeatureModulePlugin(manifest: PluginManifest): FeatureModulePlugin {
    return {
        id: manifest.id,
        modules: [],
    };
}

export interface InstallResult {
    record: InstalledPluginRecord;
}

export class PluginInstallError extends Error {
    constructor(message: string, public readonly reason: string) {
        super(message);
        this.name = 'PluginInstallError';
    }
}

export async function installEntitlement(
    entitlement: NormalizedEntitlement,
    ctx: InstallContext
): Promise<InstallResult> {
    if (entitlement.status !== 'granted') {
        throw new PluginInstallError(
            `Entitlement is ${entitlement.status}, refusing to install`,
            'entitlement-not-granted'
        );
    }

    const bundle = await ctx.fetchSignedBundle(entitlement.id);
    const bundleBytes = base64ToBytes(bundle.bundleBase64);
    const verification = await verifySignedBundle({
        manifest: bundle.manifest,
        bundleBytes,
        signature: bundle.signature,
    });
    if (!verification.ok) {
        throw new PluginInstallError(
            `Refusing to install — signature verification failed (${verification.reason ?? 'unknown'})`,
            verification.reason ?? 'signature-failed'
        );
    }

    const status: InstalledPluginStatus = 'enabled';
    const record: InstalledPluginRecord = {
        entitlementId: entitlement.id,
        manifest: bundle.manifest,
        status,
        installedAt: new Date().toISOString(),
    };

    switch (bundle.manifest.artifactKind) {
        case 'theme':
        case 'asset_bundle':
            ctx.onAssetCached?.(bundle.manifest, bundleBytes);
            break;
        case 'manifest_plugin':
            registerDynamicFeaturePlugin(manifestPluginToFeatureModulePlugin(bundle.manifest));
            break;
        case 'code_plugin':
            ctx.onCodePluginLoaded?.(bundle.manifest, bundleBytes);
            break;
        default:
            throw new PluginInstallError(
                `Unknown artifact kind: ${bundle.manifest.artifactKind}`,
                'unknown-artifact-kind'
            );
    }

    return { record };
}

export function uninstallPlugin(record: InstalledPluginRecord): void {
    if (
        record.manifest.artifactKind === 'manifest_plugin' ||
        record.manifest.artifactKind === 'code_plugin'
    ) {
        unregisterDynamicFeaturePlugin(record.manifest.id);
    }
}
