// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import type { NormalizedEntitlement } from '@blackout/core';
import type { PluginArtifactKind } from '@blackout/sdk';
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
    parseOwnedAiPersona,
    parseOwnedAutomationRecipe,
} from '../../../../src/app/features/aiden/aiGoods';
import {
    equippedAiPersonaAtom,
    equippedAiPersonaIdAtom,
    ownedAiPersonasAtom,
    ownedAutomationRecipesAtom,
} from '../../../../src/app/features/aiden/aiGoodsAtoms';
import { echoAiProvider } from '../../../../src/app/features/aiden/aiProvider';

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

async function buildBundle(
    artifactKind: PluginArtifactKind,
    payload: unknown
): Promise<SignedPluginBundle> {
    const bundleBytes = new TextEncoder().encode(JSON.stringify({ kind: artifactKind, payload }));
    const bundleSha = await sha256Hex(bundleBytes);
    const manifest: PluginManifest = {
        id: `stub.${artifactKind}`,
        name: 'AI Good',
        version: '1.0.0',
        protocolVersion: 2,
        artifactKind,
        listing: { providerId: 'freeblackmarket', providerListingId: `lst-${artifactKind}` },
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

const entitlement = (id: string, listingId: string): NormalizedEntitlement =>
    ({
        id,
        status: 'granted',
        providerId: 'freeblackmarket',
        providerListingId: listingId,
        userId: 'u1',
    }) as NormalizedEntitlement;

beforeEach(() => {
    setPluginPublishingKeys([{ keyId: 'test-key', publicKey: `hmac:${HMAC_KEY_HEX}` }]);
});
afterEach(() => {
    setPluginPublishingKeys([]);
});

describe('parse AI goods', () => {
    it('parses a persona and rejects one without a system prompt', () => {
        const p = parseOwnedAiPersona({
            persona: { id: 'mentor', name: 'Mentor', systemPrompt: 'You are a patient tutor.' },
        });
        expect(p?.id).toBe('mentor');
        expect(parseOwnedAiPersona({ persona: { name: 'No Prompt' } })).toBeNull();
    });

    it('parses an automation recipe and drops empty ones', () => {
        const r = parseOwnedAutomationRecipe({
            recipe: { id: 'welcome', name: 'Welcome', triggers: ['member joins'], actions: ['send DM'] },
        });
        expect(r?.triggers).toEqual(['member joins']);
        expect(parseOwnedAutomationRecipe({ name: 'Empty' })).toBeNull();
    });
});

describe('installEntitlement(ai goods)', () => {
    it('decodes a persona, equips it, and injects a system prompt the echo provider sees', async () => {
        const bundle = await buildBundle('ai_persona', {
            persona: { id: 'mentor', name: 'Mentor', systemPrompt: 'You are a patient tutor.' },
        });
        const result = await installEntitlement(entitlement('ent.persona', 'lst-ai_persona'), {
            fetchSignedBundle: async () => bundle,
        });
        expect(result.record.aiPersona?.id).toBe('mentor');

        const store = createStore();
        store.set(installedPluginsAtom, [result.record as InstalledPluginRecord]);
        expect(store.get(ownedAiPersonasAtom)).toHaveLength(1);

        store.set(equippedAiPersonaIdAtom, 'mentor');
        const equipped = store.get(equippedAiPersonaAtom);
        expect(equipped?.systemPrompt).toContain('patient tutor');

        const reply = await echoAiProvider.complete([
            { role: 'system', content: equipped!.systemPrompt },
            { role: 'user', content: 'hello' },
        ]);
        expect(reply).toBe('[persona] Echo: hello');
    });

    it('decodes an automation recipe into the owned list', async () => {
        const bundle = await buildBundle('automation_recipe', {
            recipe: { id: 'welcome', name: 'Welcome', triggers: ['member joins'], actions: ['send DM'] },
        });
        const result = await installEntitlement(entitlement('ent.auto', 'lst-automation_recipe'), {
            fetchSignedBundle: async () => bundle,
        });
        const store = createStore();
        store.set(installedPluginsAtom, [result.record as InstalledPluginRecord]);
        expect(store.get(ownedAutomationRecipesAtom)[0]?.name).toBe('Welcome');
    });
});
