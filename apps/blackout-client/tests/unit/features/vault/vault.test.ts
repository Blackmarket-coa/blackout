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
import {
    deriveVaultKey,
    encryptSecret,
    decryptSecret,
} from '../../../../src/app/features/vault/vaultCrypto';
import { parseOwnedVaultGrant } from '../../../../src/app/features/vault/vaultGoods';
import {
    ownedVaultTemplatesAtom,
    vaultSlotCapacityAtom,
} from '../../../../src/app/features/vault/vaultGoodsAtoms';

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

describe('vault crypto', () => {
    it('round-trips a secret with the right passphrase and fails with the wrong one', async () => {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveVaultKey('correct horse battery', salt);
        const blob = await encryptSecret(key, 'hunter2');
        expect(blob.algo).toBe('AES-GCM');
        expect(await decryptSecret(key, blob)).toBe('hunter2');

        const wrong = await deriveVaultKey('wrong passphrase', salt);
        await expect(decryptSecret(wrong, blob)).rejects.toBeTruthy();
    });
});

describe('parseOwnedVaultGrant', () => {
    it('parses slot and template grants and rejects junk', () => {
        const slot = parseOwnedVaultGrant({ vaultKind: 'slot', id: 'pack', name: 'Pack', slots: 10 });
        expect(slot?.slots).toBe(10);
        const tmpl = parseOwnedVaultGrant({ vaultKind: 'template', name: 'SSH key' });
        expect(tmpl?.templateLabel).toBe('SSH key');
        expect(parseOwnedVaultGrant({ vaultKind: 'nope', id: 'x' })).toBeNull();
    });
});

describe('installEntitlement(vault_item)', () => {
    beforeEach(() => {
        setPluginPublishingKeys([{ keyId: 'test-key', publicKey: `hmac:${HMAC_KEY_HEX}` }]);
    });
    afterEach(() => setPluginPublishingKeys([]));

    it('grants extra capacity and surfaces templates', async () => {
        const buildBundle = async (payload: unknown): Promise<SignedPluginBundle> => {
            const bundleBytes = new TextEncoder().encode(
                JSON.stringify({ kind: 'vault_item', payload })
            );
            const bundleSha = await sha256Hex(bundleBytes);
            const manifest: PluginManifest = {
                id: `stub.vault.${(payload as { id: string }).id}`,
                name: 'Vault',
                version: '1.0.0',
                protocolVersion: 2,
                artifactKind: 'vault_item',
                listing: { providerId: 'freeblackmarket', providerListingId: 'lst-vault' },
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
        };

        const ent = (id: string): NormalizedEntitlement =>
            ({ id, status: 'granted', providerId: 'freeblackmarket', providerListingId: 'lst-vault', userId: 'u1' }) as NormalizedEntitlement;

        const slotResult = await installEntitlement(ent('e1'), {
            fetchSignedBundle: async () => buildBundle({ vaultKind: 'slot', id: 'pack', name: 'Pack', slots: 10 }),
        });
        const tmplResult = await installEntitlement(ent('e2'), {
            fetchSignedBundle: async () => buildBundle({ vaultKind: 'template', id: 'ssh', name: 'SSH key' }),
        });

        const store = createStore();
        store.set(installedPluginsAtom, [
            slotResult.record as InstalledPluginRecord,
            tmplResult.record as InstalledPluginRecord,
        ]);
        expect(store.get(vaultSlotCapacityAtom)).toBe(15); // 5 baseline + 10
        expect(store.get(ownedVaultTemplatesAtom).map((t) => t.id)).toEqual(['ssh']);
    });
});
