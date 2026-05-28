// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import type { NormalizedEntitlement } from '@blackout/core';
import type { PluginManifest, SignedPluginBundle } from '@blackout/sdk';
import { installEntitlement } from '../../../../src/app/features/monetization/install/pluginInstaller';
import {
    installedPluginsAtom,
    type InstalledPluginRecord,
} from '../../../../src/app/features/monetization/install/installedPluginsAtom';
import {
    canonicalManifestSha256,
    setPluginPublishingKeys,
} from '../../../../src/app/features/monetization/install/pluginSignature';
import { parseOwnedCosmetic } from '../../../../src/app/features/profile/cosmeticTypes';
import {
    avatarDecorationCatalogAtom,
    nameplateCatalogAtom,
} from '../../../../src/app/features/profile/cosmeticsAtoms';

const HMAC_KEY_HEX =
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

function hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
async function sha256Hex(bytes: Uint8Array): Promise<string> {
    return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
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
    return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, payload)));
}
function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

const entitlement: NormalizedEntitlement = {
    id: 'ent.cosmetic',
    status: 'granted',
    providerId: 'freeblackmarket',
    providerListingId: 'lst-cosmetic',
    userId: 'u1',
} as NormalizedEntitlement;

async function buildCosmeticBundle(payload: unknown): Promise<SignedPluginBundle> {
    const bundleBytes = new TextEncoder().encode(JSON.stringify({ kind: 'profile_cosmetic', payload }));
    const bundleSha = await sha256Hex(bundleBytes);
    const manifest: PluginManifest = {
        id: 'stub.cosmetic',
        name: 'Aurora Ring',
        version: '1.0.0',
        protocolVersion: 2,
        artifactKind: 'profile_cosmetic',
        listing: { providerId: 'freeblackmarket', providerListingId: 'lst-cosmetic' },
        capabilities: [],
        sha256: bundleSha,
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
    setPluginPublishingKeys([{ keyId: 'test-key', publicKey: `hmac:${HMAC_KEY_HEX}` }]);
});
afterEach(() => {
    setPluginPublishingKeys([]);
});

describe('parseOwnedCosmetic', () => {
    it('accepts a valid avatar decoration and sanitizes the gradient', () => {
        const c = parseOwnedCosmetic({
            cosmeticType: 'avatar_decoration',
            id: 'ring-aurora-01',
            gradient: ['#7af0ff', '#9d8df1'],
        });
        expect(c?.cosmeticType).toBe('avatar_decoration');
        expect(c?.cssGradient).toContain('linear-gradient');
    });

    it('rejects unknown cosmetic types and unsafe css', () => {
        expect(parseOwnedCosmetic({ cosmeticType: 'nope', id: 'x' })).toBeNull();
        const c = parseOwnedCosmetic({
            cosmeticType: 'nameplate',
            id: 'np1',
            cssGradient: 'url(http://evil)',
        });
        expect(c?.cssGradient).toBeUndefined();
    });
});

describe('installEntitlement(profile_cosmetic)', () => {
    it('decodes the cosmetic onto the record and surfaces it in the catalog', async () => {
        const bundle = await buildCosmeticBundle({
            cosmeticType: 'avatar_decoration',
            id: 'ring-aurora-01',
            label: 'Aurora Ring',
            gradient: ['#7af0ff', '#9d8df1'],
            cssGlow: 'rgba(122,240,255,0.45)',
        });
        const result = await installEntitlement(entitlement, {
            fetchSignedBundle: async () => bundle,
        });
        expect(result.record.cosmetic?.id).toBe('ring-aurora-01');

        const store = createStore();
        store.set(installedPluginsAtom, [result.record as InstalledPluginRecord]);
        const catalog = store.get(avatarDecorationCatalogAtom);
        expect(catalog.some((d) => d.id === 'ring-aurora-01')).toBe(true);
    });

    it('owned nameplates appear alongside built-ins', async () => {
        const bundle = await buildCosmeticBundle({
            cosmeticType: 'nameplate',
            id: 'np-gold',
            label: 'Gold',
            gradient: ['#f9c74f', '#f8961e'],
            textColor: '#1b1b1b',
        });
        const result = await installEntitlement(entitlement, {
            fetchSignedBundle: async () => bundle,
        });
        const store = createStore();
        store.set(installedPluginsAtom, [result.record as InstalledPluginRecord]);
        const plates = store.get(nameplateCatalogAtom);
        expect(plates.some((p) => p.id === 'np-gold')).toBe(true);
        expect(plates.some((p) => p.id === 'nameplate-default')).toBe(true);
    });
});
