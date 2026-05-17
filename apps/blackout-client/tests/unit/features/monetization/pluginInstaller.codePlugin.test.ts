// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NormalizedEntitlement } from '@blackout/core';
import type { PluginManifest, SignedPluginBundle } from '@blackout/sdk';
import {
    installEntitlement,
    uninstallPlugin,
} from '../../../../src/app/features/monetization/install/pluginInstaller';
import {
    getSandbox,
    unmountSandbox,
} from '../../../../src/app/features/monetization/install/sandbox/sandboxRegistry';
import {
    canonicalManifestSha256,
    setPluginPublishingKeys,
} from '../../../../src/app/features/monetization/install/pluginSignature';

const HMAC_KEY_HEX =
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

function hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(digest));
}

async function signBundle(manifestSha: string, bundleSha: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        hexToBytes(HMAC_KEY_HEX),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const payload = new TextEncoder().encode(`${manifestSha}:${bundleSha}`);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
    return bytesToHex(sig);
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

const pluginId = 'com.example.code-plugin';
const entitlement: NormalizedEntitlement = {
    id: 'ent.code-plugin',
    status: 'granted',
    providerId: 'freeblackmarket',
    providerListingId: 'lst-code-plugin',
    userId: 'u1',
    purchasedAt: '2026-05-17T00:00:00Z',
} as NormalizedEntitlement;

async function buildBundle(
    overrides: Partial<PluginManifest> = {},
): Promise<SignedPluginBundle> {
    const bundleBytes = new TextEncoder().encode('// noop plugin body\n');
    const bundleSha = await sha256Hex(bundleBytes);
    const manifest: PluginManifest = {
        id: pluginId,
        name: 'Code Plugin',
        version: '1.0.0',
        protocolVersion: 2,
        artifactKind: 'code_plugin',
        listing: { providerId: 'freeblackmarket', providerListingId: 'lst-code-plugin' },
        capabilities: ['message.read', 'http.fetch'],
        sha256: bundleSha,
        ...overrides,
    };
    const manifestSha = await canonicalManifestSha256(manifest);
    const signature = await signBundle(manifestSha, bundleSha);
    return {
        manifest,
        bundleBase64: bytesToBase64(bundleBytes),
        signature: {
            keyId: 'test-key',
            signature,
            manifestSha256: manifestSha,
            sha256: bundleSha,
            issuedAt: '2026-05-17T00:00:00Z',
        },
    };
}

beforeEach(() => {
    setPluginPublishingKeys([
        { keyId: 'test-key', publicKey: `hmac:${HMAC_KEY_HEX}` },
    ]);
});

afterEach(() => {
    unmountSandbox(pluginId);
    setPluginPublishingKeys([]);
});

describe('installEntitlement(code_plugin)', () => {
    it('mounts a sandbox in the registry and grants all declared capabilities by default', async () => {
        const bundle = await buildBundle();
        const result = await installEntitlement(entitlement, {
            fetchSignedBundle: async () => bundle,
        });

        expect(result.record.grantedCapabilities).toEqual(['message.read', 'http.fetch']);
        expect(getSandbox(pluginId)).toBeDefined();
    });

    it('intersects grantedCapabilities with approvedCapabilities', async () => {
        const bundle = await buildBundle();
        const result = await installEntitlement(entitlement, {
            fetchSignedBundle: async () => bundle,
            approvedCapabilities: ['message.read'],
        });

        expect(result.record.grantedCapabilities).toEqual(['message.read']);
        expect(getSandbox(pluginId)).toBeDefined();
    });

    it('uninstallPlugin tears down the sandbox', async () => {
        const bundle = await buildBundle();
        const result = await installEntitlement(entitlement, {
            fetchSignedBundle: async () => bundle,
        });
        expect(getSandbox(pluginId)).toBeDefined();

        uninstallPlugin(result.record);
        expect(getSandbox(pluginId)).toBeUndefined();
    });
});
