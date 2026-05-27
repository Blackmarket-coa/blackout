import type { InstallScope, NormalizedEntitlement } from '@blackout/core';
import type { PluginManifest, SignedPluginBundle } from '@blackout/sdk';
import {
    registerDynamicFeaturePlugin,
    unregisterDynamicFeaturePlugin,
} from '../../../core/features/plugins';
import type {
    FeatureModulePlugin,
    ShellPanelEntry,
} from '../../../core/features/types';
import type {
    InstalledPluginRecord,
    InstalledPluginStatus,
} from './installedPluginsAtom';
import { mountSandbox, unmountSandbox } from './sandbox/sandboxRegistry';
import { verifySignedBundle } from './pluginSignature';
import { parseOwnedCosmetic, type OwnedCosmetic } from '../../profile/cosmeticTypes';
import { parseOwnedTemplate, type OwnedTemplate } from '../../streaming/kits/communityTemplate';
import {
    parseOwnedAiPersona,
    parseOwnedAutomationRecipe,
    type OwnedAiPersona,
    type OwnedAutomationRecipe,
} from '../../aiden/aiGoods';
import { parseOwnedVaultGrant, type OwnedVaultGrant } from '../../vault/vaultGoods';
import { parseOwnedSoundPack, type OwnedSoundPack } from '../../audio/soundPackGoods';

export interface InstallContext {
    fetchSignedBundle: (entitlementId: string) => Promise<SignedPluginBundle>;
    onAssetCached?: (manifest: PluginManifest, bytes: Uint8Array) => void;
    /**
     * Optional observer fired after a code plugin's sandbox has been
     * mounted. The host wires sandbox lifecycle automatically via the
     * sandbox registry; this callback is for tests/telemetry that need to
     * observe the moment a plugin came online.
     */
    onCodePluginLoaded?: (manifest: PluginManifest, bytes: Uint8Array) => void;
    /**
     * Capability subset the user approved at the install dialog. When
     * omitted, all manifest-declared capabilities are granted.
     */
    approvedCapabilities?: PluginManifest['capabilities'];
    /**
     * Scope this install activates in (Phase 1). Omitted means a user-global
     * install, which stays visible regardless of the shell's current scope.
     */
    scope?: InstallScope;
    /**
     * Whether the den this install is activating in permits AI tooling (Phase
     * 2). Defaults to `false` (fail-closed): a code plugin's sandbox denies
     * `ai.inference` at runtime unless this is `true` for an AI den.
     */
    aiAllowed?: boolean;
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
}

/**
 * Decode a verified bundle's bytes into its payload object. The bundle is UTF-8
 * JSON; accept either `{ payload: {...} }` (the canonical envelope) or a bare
 * object. Returns null on any decode failure.
 */
function decodeBundlePayload(bundleBytes: Uint8Array): unknown {
    try {
        const parsed = JSON.parse(new TextDecoder().decode(bundleBytes)) as Record<string, unknown>;
        return parsed && typeof parsed === 'object' && 'payload' in parsed ? parsed.payload : parsed;
    } catch {
        return null;
    }
}

function decodeCosmetic(bundleBytes: Uint8Array): OwnedCosmetic | null {
    return parseOwnedCosmetic(decodeBundlePayload(bundleBytes));
}

function decodeTemplate(bundleBytes: Uint8Array): OwnedTemplate | null {
    return parseOwnedTemplate(decodeBundlePayload(bundleBytes));
}

function decodeAiPersona(bundleBytes: Uint8Array): OwnedAiPersona | null {
    return parseOwnedAiPersona(decodeBundlePayload(bundleBytes));
}

function decodeAutomationRecipe(bundleBytes: Uint8Array): OwnedAutomationRecipe | null {
    return parseOwnedAutomationRecipe(decodeBundlePayload(bundleBytes));
}

function decodeVaultGrant(bundleBytes: Uint8Array): OwnedVaultGrant | null {
    return parseOwnedVaultGrant(decodeBundlePayload(bundleBytes));
}

function decodeSoundPack(bundleBytes: Uint8Array): OwnedSoundPack | null {
    return parseOwnedSoundPack(decodeBundlePayload(bundleBytes));
}

/**
 * Reserved high-order band so installed-plugin pinned-nav entries sort
 * below core nav (which uses orders < 1000). Individual plugins can pick
 * their own offset inside the band via `pinnedNav.order`.
 */
const PINNED_NAV_ORDER_BAND = 1000;

function buildPanelsFromManifest(manifest: PluginManifest): ShellPanelEntry[] {
    const panels: ShellPanelEntry[] = [];
    if (manifest.pinnedNav) {
        panels.push({
            id: `${manifest.id}.pinned-nav`,
            kind: 'sidebar',
            label: manifest.pinnedNav.label,
            to: manifest.pinnedNav.to ?? `/plugins/${encodeURIComponent(manifest.id)}`,
            order: manifest.pinnedNav.order ?? PINNED_NAV_ORDER_BAND,
        });
    }
    return panels;
}

function manifestPluginToFeatureModulePlugin(manifest: PluginManifest): FeatureModulePlugin {
    const panels = buildPanelsFromManifest(manifest);
    return {
        id: manifest.id,
        modules: [
            {
                feature: {
                    id: manifest.id,
                    name: manifest.name,
                    customizations: [
                        {
                            id: `${manifest.id}-installed`,
                            name: manifest.name,
                            category: 'visual/layout plugin',
                            panels,
                        },
                    ],
                },
            },
        ],
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
    const declared = bundle.manifest.capabilities;
    const grantedCapabilities = ctx.approvedCapabilities
        ? declared.filter((cap) => ctx.approvedCapabilities!.includes(cap))
        : [...declared];
    const record: InstalledPluginRecord = {
        entitlementId: entitlement.id,
        manifest: bundle.manifest,
        status,
        installedAt: new Date().toISOString(),
        grantedCapabilities,
        ...(ctx.scope ? { scope: ctx.scope } : {}),
    };

    switch (bundle.manifest.artifactKind) {
        case 'theme':
        case 'asset_bundle':
        // Stream assets cache their verified bundle for the streaming surface.
        case 'stream_asset':
            ctx.onAssetCached?.(bundle.manifest, bundleBytes);
            break;
        case 'sound_pack':
            record.soundPack = decodeSoundPack(bundleBytes) ?? undefined;
            ctx.onAssetCached?.(bundle.manifest, bundleBytes);
            break;
        case 'vault_item':
            record.vaultGrant = decodeVaultGrant(bundleBytes) ?? undefined;
            ctx.onAssetCached?.(bundle.manifest, bundleBytes);
            break;
        case 'profile_cosmetic':
            record.cosmetic = decodeCosmetic(bundleBytes) ?? undefined;
            ctx.onAssetCached?.(bundle.manifest, bundleBytes);
            break;
        case 'community_template':
            record.template = decodeTemplate(bundleBytes) ?? undefined;
            ctx.onAssetCached?.(bundle.manifest, bundleBytes);
            break;
        case 'ai_persona':
            record.aiPersona = decodeAiPersona(bundleBytes) ?? undefined;
            ctx.onAssetCached?.(bundle.manifest, bundleBytes);
            break;
        case 'automation_recipe':
            record.automationRecipe = decodeAutomationRecipe(bundleBytes) ?? undefined;
            ctx.onAssetCached?.(bundle.manifest, bundleBytes);
            break;
        case 'manifest_plugin':
            registerDynamicFeaturePlugin(manifestPluginToFeatureModulePlugin(bundle.manifest));
            break;
        case 'code_plugin':
            mountSandbox(bundle.manifest, bundleBytes, grantedCapabilities, ctx.aiAllowed ?? false);
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
    if (record.manifest.artifactKind === 'code_plugin') {
        unmountSandbox(record.manifest.id);
    }
}
