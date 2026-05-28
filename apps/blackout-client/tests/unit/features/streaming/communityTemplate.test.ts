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
    parseOwnedTemplate,
    templateToKit,
} from '../../../../src/app/features/streaming/kits/communityTemplate';
import { ownedTemplateKitsAtom } from '../../../../src/app/features/streaming/kits/ownedTemplatesAtom';

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

const entitlement: NormalizedEntitlement = {
    id: 'ent.template',
    status: 'granted',
    providerId: 'freeblackmarket',
    providerListingId: 'lst-template',
    userId: 'u1',
} as NormalizedEntitlement;

async function buildTemplateBundle(payload: unknown): Promise<SignedPluginBundle> {
    const bundleBytes = new TextEncoder().encode(
        JSON.stringify({ kind: 'community_template', payload })
    );
    const bundleSha = await sha256Hex(bundleBytes);
    const manifest: PluginManifest = {
        id: 'stub.template',
        name: 'Study Hall',
        version: '1.0.0',
        protocolVersion: 2,
        artifactKind: 'community_template',
        listing: { providerId: 'freeblackmarket', providerListingId: 'lst-template' },
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

describe('parseOwnedTemplate', () => {
    it('parses dens (string or object), tiers, and only a status from profile', () => {
        const t = parseOwnedTemplate({
            template: {
                id: 'study-hall',
                name: 'Study Hall',
                profile: { status: { text: 'Welcome!' }, bio: 'SHOULD NOT CLOBBER' },
                dens: ['Lobby', { name: 'Study', topic: 'Focus room', kind: 'public' }],
                tiers: [{ name: 'Member', priceCents: 500, currency: 'USD' }],
            },
        });
        expect(t?.id).toBe('study-hall');
        expect(t?.apply.dens).toHaveLength(2);
        expect(t?.apply.dens?.[1]).toMatchObject({ name: 'Study', kind: 'public' });
        expect(t?.apply.tiers?.[0]).toMatchObject({ name: 'Member', priceCents: 500 });
        // Only status is carried from profile (no bio clobber).
        expect(t?.apply.profile).toEqual({ status: { text: 'Welcome!', emoji: undefined } });
    });

    it('rejects junk and drops malformed tiers', () => {
        expect(parseOwnedTemplate(null)).toBeNull();
        const t = parseOwnedTemplate({
            id: 'x',
            name: 'X',
            tiers: [{ name: 'NoPrice' }, { name: 'Ok', priceCents: 100, currency: 'USD' }],
        });
        expect(t?.apply.tiers).toHaveLength(1);
    });
});

describe('installEntitlement(community_template)', () => {
    it('decodes the template onto the record and surfaces it as an owned kit', async () => {
        const bundle = await buildTemplateBundle({
            template: { id: 'study-hall', name: 'Study Hall', dens: ['Lobby'] },
        });
        const result = await installEntitlement(entitlement, {
            fetchSignedBundle: async () => bundle,
        });
        expect(result.record.template?.id).toBe('study-hall');

        const store = createStore();
        store.set(installedPluginsAtom, [result.record as InstalledPluginRecord]);
        const kits = store.get(ownedTemplateKitsAtom);
        expect(kits).toHaveLength(1);
        expect(kits[0].id).toBe('template:study-hall');
        expect(kits[0].apply?.dens?.[0].name).toBe('Lobby');
    });
});

describe('templateToKit', () => {
    it('adapts a template into a CreatorKit shape', () => {
        const kit = templateToKit({
            id: 't1',
            name: 'Template One',
            apply: { dens: [{ name: 'Den', kind: 'public' }] },
        });
        expect(kit.id).toBe('template:t1');
        expect(kit.configures.dens[0]).toContain('Den');
    });
});
