import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    canonicalManifestSha256,
    setPluginPublishingKeys,
    verifySignedBundle,
} from '../../src/app/features/monetization/install/pluginSignature';

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

const MANIFEST = {
    id: 'com.example.test',
    name: 'Test plugin',
    version: '1.0.0',
    artifactKind: 'manifest_plugin' as const,
    listing: { providerId: 'freeblackmarket', providerListingId: 'lst-1' },
    capabilities: [],
    sha256: '',
};

beforeEach(() => {
    setPluginPublishingKeys([
        { keyId: 'test-key', publicKey: `hmac:${HMAC_KEY_HEX}` },
    ]);
});

afterEach(() => {
    setPluginPublishingKeys([]);
});

describe('verifySignedBundle', () => {
    it('accepts a properly signed bundle', async () => {
        const bundle = new TextEncoder().encode('hello world');
        const bundleSha = await sha256Hex(bundle);
        const manifest = { ...MANIFEST, sha256: bundleSha };
        const manifestSha = await canonicalManifestSha256(manifest);
        const signature = await makeSignature(manifestSha, bundleSha);

        const result = await verifySignedBundle({
            manifest,
            bundleBytes: bundle,
            signature: {
                keyId: 'test-key',
                signature,
                manifestSha256: manifestSha,
                sha256: bundleSha,
                issuedAt: '2026-05-01T00:00:00.000Z',
            },
        });

        expect(result.ok).toBe(true);
        expect(result.keyId).toBe('test-key');
    });

    it('rejects an unknown key id', async () => {
        const bundle = new TextEncoder().encode('x');
        const bundleSha = await sha256Hex(bundle);
        const manifestSha = await canonicalManifestSha256({ ...MANIFEST, sha256: bundleSha });
        const result = await verifySignedBundle({
            manifest: { ...MANIFEST, sha256: bundleSha },
            bundleBytes: bundle,
            signature: {
                keyId: 'not-a-real-key',
                signature: '00',
                manifestSha256: manifestSha,
                sha256: bundleSha,
                issuedAt: '2026-05-01T00:00:00.000Z',
            },
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('unknown-key-id');
    });

    it('rejects a tampered bundle', async () => {
        const bundle = new TextEncoder().encode('original');
        const bundleSha = await sha256Hex(bundle);
        const manifest = { ...MANIFEST, sha256: bundleSha };
        const manifestSha = await canonicalManifestSha256(manifest);
        const signature = await makeSignature(manifestSha, bundleSha);

        const tampered = new TextEncoder().encode('TAMPERED');
        const result = await verifySignedBundle({
            manifest,
            bundleBytes: tampered,
            signature: {
                keyId: 'test-key',
                signature,
                manifestSha256: manifestSha,
                sha256: bundleSha,
                issuedAt: '2026-05-01T00:00:00.000Z',
            },
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('bundle-sha-mismatch');
    });

    it('rejects a tampered manifest', async () => {
        const bundle = new TextEncoder().encode('payload');
        const bundleSha = await sha256Hex(bundle);
        const manifest = { ...MANIFEST, sha256: bundleSha };
        const manifestSha = await canonicalManifestSha256(manifest);
        const signature = await makeSignature(manifestSha, bundleSha);

        const evilManifest = { ...manifest, name: 'Free RCE' };
        const result = await verifySignedBundle({
            manifest: evilManifest,
            bundleBytes: bundle,
            signature: {
                keyId: 'test-key',
                signature,
                manifestSha256: manifestSha,
                sha256: bundleSha,
                issuedAt: '2026-05-01T00:00:00.000Z',
            },
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('manifest-sha-mismatch');
    });
});
