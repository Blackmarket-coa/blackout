// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import {
    canonicalManifestSha256,
    setPluginPublishingKeys,
} from '../../../src/app/features/monetization/install/pluginSignature';
import { installEntitlement } from '../../../src/app/features/monetization/install/pluginInstaller';
import {
    _resetDynamicFeaturePluginsForTest,
    getAllFeaturePlugins,
} from '../../../src/app/core/features/plugins';
import { _resetRuntimeModuleAllowlistForTest } from '../../../src/app/core/features/manifest';
import { buildFeatureRegistry } from '../../../src/app/core/features/buildRegistry';
import {
    composeFeatureRoutes,
    composeShellPanels,
    selectPanelsByKind,
} from '../../../src/app/core/features/composition';
import { defaultFeatureFlags } from '../../../src/app/core/features/featureFlags';
import { PluginRouteBoundary } from '../../../src/app/core/features/PluginRouteBoundary';
import type { NormalizedEntitlement } from '@blackout/protocol';
import type { PluginManifest, SignedPluginBundle } from '@blackout/sdk';

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

async function makeSignature(manifestSha: string, bundleSha: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        hexToBytes(HMAC_KEY_HEX),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const payload = new TextEncoder().encode(`${manifestSha}:${bundleSha}`);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
    return bytesToHex(sig);
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

async function buildSignedBundle(overrides: Partial<PluginManifest>): Promise<SignedPluginBundle> {
    const bundleBytes = new TextEncoder().encode('bundle');
    const bundleSha = await sha256Hex(bundleBytes);
    const manifest: PluginManifest = {
        id: 'com.example.spatial-fixture',
        name: 'Spatial fixture',
        version: '1.0.0',
        artifactKind: 'manifest_plugin',
        listing: { providerId: 'freeblackmarket', providerListingId: 'lst-spatial' },
        capabilities: [],
        sha256: bundleSha,
        ...overrides,
    };
    const manifestSha = await canonicalManifestSha256(manifest);
    const signature = await makeSignature(manifestSha, bundleSha);
    return {
        manifest,
        bundleBase64: bytesToBase64(bundleBytes),
        signature: {
            keyId: 'test-key',
            signature,
            manifestSha256: manifestSha,
            sha256: bundleSha,
            issuedAt: '2026-05-17T00:00:00.000Z',
        },
    };
}

const entitlement: NormalizedEntitlement = {
    id: 'ent-spatial',
    status: 'granted',
    pluginId: 'com.example.spatial-fixture',
    grantedAt: '2026-05-17T00:00:00.000Z',
} as NormalizedEntitlement;

beforeEach(() => {
    setPluginPublishingKeys([{ keyId: 'test-key', publicKey: `hmac:${HMAC_KEY_HEX}` }]);
});

afterEach(() => {
    setPluginPublishingKeys([]);
    _resetDynamicFeaturePluginsForTest();
    _resetRuntimeModuleAllowlistForTest();
});

describe('plugin spatial representation', () => {
    it('translates pinnedNav into a sidebar shell panel via the dynamic registry', async () => {
        const bundle = await buildSignedBundle({
            pinnedNav: { label: 'Spatial', to: '/p/spatial' },
            homepageCard: { title: 'Spatial card', subtitle: 'on home', to: '/p/spatial' },
        });

        await installEntitlement(entitlement, {
            fetchSignedBundle: async () => bundle,
        });

        const registry = buildFeatureRegistry(defaultFeatureFlags, getAllFeaturePlugins());
        const panels = selectPanelsByKind(
            composeShellPanels(registry, { capabilities: [], flags: defaultFeatureFlags }),
            'sidebar'
        );
        const pinned = panels.find((p) => p.id === 'com.example.spatial-fixture.pinned-nav');
        expect(pinned).toBeDefined();
        expect(pinned?.label).toBe('Spatial');
        expect(pinned?.to).toBe('/p/spatial');
        expect(pinned?.order).toBe(1000);
    });

    it('omits panels when neither spatial field is declared', async () => {
        const bundle = await buildSignedBundle({});

        await installEntitlement(entitlement, {
            fetchSignedBundle: async () => bundle,
        });

        const registry = buildFeatureRegistry(defaultFeatureFlags, getAllFeaturePlugins());
        const panels = composeShellPanels(registry, {
            capabilities: [],
            flags: defaultFeatureFlags,
        });
        expect(panels.find((p) => p.id.startsWith('com.example.spatial-fixture'))).toBeUndefined();
    });

    it('attaches pluginId to composed routes', () => {
        const Component = () => null;
        const registry = [
            {
                id: 'demo-plugin',
                name: 'Demo',
                customizations: [
                    {
                        id: 'demo-plugin-shell',
                        name: 'Demo Shell',
                        category: 'visual/layout plugin' as const,
                        routes: [{ path: '/demo', component: Component }],
                    },
                ],
            },
        ];
        const routes = composeFeatureRoutes(registry, {
            capabilities: [],
            flags: defaultFeatureFlags,
        });
        expect(routes).toHaveLength(1);
        expect(routes[0].pluginId).toBe('demo-plugin');
    });
});

describe('PluginRouteBoundary', () => {
    it('renders the fallback when its child throws', async () => {
        const Boom = () => {
            throw new Error('plugin exploded');
        };
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        // Suppress the expected console.error from React's render error logging.
        const originalError = console.error;
        console.error = () => {};
        try {
            await act(async () => {
                root.render(
                    <PluginRouteBoundary pluginId="demo-plugin">
                        <Boom />
                    </PluginRouteBoundary>
                );
                await Promise.resolve();
            });
            const fallback = container.querySelector(
                '[data-testid="plugin-route-error"]'
            ) as HTMLElement | null;
            expect(fallback).not.toBeNull();
            expect(fallback?.getAttribute('data-plugin-id')).toBe('demo-plugin');
            expect(fallback?.textContent).toContain('plugin exploded');
        } finally {
            console.error = originalError;
            await act(async () => {
                root.unmount();
            });
            container.remove();
        }
    });
});
