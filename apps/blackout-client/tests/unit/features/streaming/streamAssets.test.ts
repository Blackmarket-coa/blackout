// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { parseOwnedStreamAsset } from '../../../../src/app/features/streaming/overlays/streamAssetGoods';
import {
    ownedChannelPointKitsAtom,
    ownedOverlayPacksAtom,
} from '../../../../src/app/features/streaming/overlays/streamAssetAtoms';

const createRewardMock = vi.fn(async () => ({}) as never);
vi.mock('../../../../src/app/features/streams/channelPointsClient', () => ({
    createReward: (...args: unknown[]) => createRewardMock(...args),
    isValidRewardTitle: (t: string) => t.trim().length > 0 && t.length <= 80,
    isValidCost: (c: number) => Number.isInteger(c) && c > 0 && c <= 10_000_000,
}));

const { applyChannelPointKit } = await import(
    '../../../../src/app/features/streaming/overlays/applyChannelPointKit'
);

const HMAC_KEY_HEX =
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
function hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
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
async function buildBundle(payload: unknown): Promise<SignedPluginBundle> {
    const bundleBytes = new TextEncoder().encode(JSON.stringify({ kind: 'stream_asset', payload }));
    const bundleSha = await sha256Hex(bundleBytes);
    const manifest: PluginManifest = {
        id: 'stub.stream',
        name: 'Overlay',
        version: '1.0.0',
        protocolVersion: 2,
        artifactKind: 'stream_asset',
        listing: { providerId: 'freeblackmarket', providerListingId: 'lst-stream' },
        capabilities: [],
        sha256: bundleSha,
    };
    const manifestSha = await canonicalManifestSha256(manifest);
    return {
        manifest,
        bundleBase64: bytesToBase64(bundleBytes),
        signature: {
            keyId: 'test-key',
            signature: await signBundle(manifestSha, bundleSha),
            manifestSha256: manifestSha,
            sha256: bundleSha,
            issuedAt: '2026-05-17T00:00:00Z',
        },
    };
}
const ent = (id: string): NormalizedEntitlement =>
    ({ id, status: 'granted', providerId: 'freeblackmarket', providerListingId: 'lst-stream', userId: 'u1' }) as NormalizedEntitlement;

describe('parseOwnedStreamAsset', () => {
    it('parses an overlay pack and clamps element coordinates', () => {
        const a = parseOwnedStreamAsset({
            assetType: 'overlay',
            id: 'neon',
            name: 'Neon',
            scenes: [
                { id: 'live', name: 'Live', elements: [{ id: 'title', kind: 'text', x: 999, y: -5, text: 'LIVE' }] },
            ],
        });
        expect(a?.scenes?.[0].elements[0].x).toBe(100);
        expect(a?.scenes?.[0].elements[0].y).toBe(0);
    });

    it('drops image elements with non-https urls', () => {
        const a = parseOwnedStreamAsset({
            assetType: 'overlay',
            id: 'p',
            name: 'P',
            scenes: [{ id: 's', name: 'S', elements: [{ id: 'i', kind: 'image', imageUrl: 'http://x/y.png' }] }],
        });
        expect(a?.scenes?.[0].elements[0].imageUrl).toBeUndefined();
    });

    it('rejects unknown asset types and empty kits', () => {
        expect(parseOwnedStreamAsset({ assetType: 'nope', id: 'x' })).toBeNull();
        expect(parseOwnedStreamAsset({ assetType: 'channel_point_kit', id: 'x', name: 'X', rewards: [] })).toBeNull();
    });
});

describe('installEntitlement(stream_asset) + atoms', () => {
    beforeEach(() => {
        setPluginPublishingKeys([{ keyId: 'test-key', publicKey: `hmac:${HMAC_KEY_HEX}` }]);
    });
    afterEach(() => setPluginPublishingKeys([]));

    it('decodes an overlay asset and surfaces it in the overlay atom', async () => {
        const result = await installEntitlement(ent('e1'), {
            fetchSignedBundle: async () =>
                buildBundle({
                    assetType: 'overlay',
                    id: 'neon',
                    name: 'Neon',
                    scenes: [{ id: 'live', name: 'Live', elements: [] }],
                }),
        });
        expect(result.record.streamAsset?.assetType).toBe('overlay');
        const store = createStore();
        store.set(installedPluginsAtom, [result.record as InstalledPluginRecord]);
        expect(store.get(ownedOverlayPacksAtom)).toHaveLength(1);
        expect(store.get(ownedChannelPointKitsAtom)).toHaveLength(0);
    });
});

describe('applyChannelPointKit', () => {
    beforeEach(() => createRewardMock.mockClear());

    it('creates valid rewards and skips invalid ones', async () => {
        const results = await applyChannelPointKit({
            id: 'kit',
            name: 'Kit',
            assetType: 'channel_point_kit',
            rewards: [
                { title: 'Hydrate', cost: 100 },
                { title: '', cost: 50 },
                { title: 'Pushups', cost: -5 },
            ],
        });
        expect(results.map((r) => r.status)).toEqual(['ok', 'skipped', 'skipped']);
        expect(createRewardMock).toHaveBeenCalledTimes(1);
        expect(createRewardMock).toHaveBeenCalledWith(
            { title: 'Hydrate', cost: 100, prompt: undefined },
            undefined
        );
    });
});
