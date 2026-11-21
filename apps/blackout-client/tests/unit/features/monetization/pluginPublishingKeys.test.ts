/**
 * Which keys a plugin bundle's signature is checked against
 * (features/monetization/install/pluginSignature.ts).
 *
 * Until 2026-11-17 the only key, in every build, was an HMAC secret written in
 * the client's source, so anyone with the client could sign a bundle it would
 * install (trust-claims T22). A production build now trusts only Ed25519 keys
 * pinned when it was built, refuses HMAC, and installs nothing without a key.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    canonicalManifestSha256,
    isEd25519PublicKey,
    parsePublishingKeys,
    setPluginPublishingKeys,
    verifySignedBundle,
} from '../../../../src/app/features/monetization/install/pluginSignature';
import { signatureFailureMessage } from '../../../../src/app/features/monetization/install/pluginInstaller';

const SIGNATURE_MODULE = '../../../../src/app/features/monetization/install/pluginSignature';

const toBase64 = (bytes: ArrayBuffer | Uint8Array): string =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)));

const toHex = (bytes: ArrayBuffer): string =>
    Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

async function ed25519Key(): Promise<{ publicKey: string; sign(text: string): Promise<string> }> {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
        'sign',
        'verify',
    ])) as CryptoKeyPair;
    return {
        publicKey: toBase64(await crypto.subtle.exportKey('spki', pair.publicKey)),
        sign: async (text) =>
            toBase64(
                await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(text))
            ),
    };
}

/** A bundle and its envelope, signed by `sign`, the way Free Black Market signs. */
async function signedBundle(keyId: string, sign: (text: string) => Promise<string>) {
    const bundleBytes = new TextEncoder().encode('{"kind":"theme","payload":{}}');
    const sha256 = toHex(await crypto.subtle.digest('SHA-256', bundleBytes));
    const manifest = {
        id: 'coop.example.theme',
        name: 'Example theme',
        version: '1.0.0',
        artifactKind: 'theme' as const,
        listing: { providerId: 'freeblackmarket', providerListingId: 'lst-1' },
        capabilities: [],
        sha256,
    };
    const manifestSha256 = await canonicalManifestSha256(manifest);
    const signature = {
        keyId,
        signature: await sign(`${manifestSha256}:${sha256}`),
        manifestSha256,
        sha256,
        issuedAt: '2026-11-17T00:00:00.000Z',
    };
    return { manifest, bundleBytes, signature };
}

async function hmacSign(secretHex: string, text: string): Promise<string> {
    const raw = new Uint8Array(secretHex.match(/../g)!.map((pair) => parseInt(pair, 16)));
    const key = await crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    setPluginPublishingKeys([]);
});

describe('an Ed25519 publishing key', () => {
    it('installs a bundle it signed', async () => {
        const key = await ed25519Key();
        const bundle = await signedBundle('fbm-2026-11', key.sign);
        const result = await verifySignedBundle({
            ...bundle,
            keys: [{ keyId: 'fbm-2026-11', publicKey: key.publicKey }],
        });
        expect(result).toEqual({ ok: true, keyId: 'fbm-2026-11' });
    });

    it('refuses a bundle another key signed under the same key id', async () => {
        const pinned = await ed25519Key();
        const other = await ed25519Key();
        const bundle = await signedBundle('fbm-2026-11', other.sign);
        const result = await verifySignedBundle({
            ...bundle,
            keys: [{ keyId: 'fbm-2026-11', publicKey: pinned.publicKey }],
        });
        expect(result.reason).toBe('signature-mismatch');
    });
});

describe('parsePublishingKeys (VITE_PLUGIN_PUBLISHING_KEYS)', () => {
    it('reads keyId:key entries separated by commas or spaces', async () => {
        const a = await ed25519Key();
        const b = await ed25519Key();
        expect(parsePublishingKeys(` fbm-a:${a.publicKey},\n fbm.b_2:${b.publicKey} `)).toEqual({
            keys: [
                { keyId: 'fbm-a', publicKey: a.publicKey },
                { keyId: 'fbm.b_2', publicKey: b.publicKey },
            ],
            rejected: [],
        });
        expect(parsePublishingKeys(undefined)).toEqual({ keys: [], rejected: [] });
    });

    it('takes nothing that is not an Ed25519 public key under a plain id', async () => {
        const good = await ed25519Key();
        const p256 = (await crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign']
        )) as CryptoKeyPair;
        const p256Spki = toBase64(await crypto.subtle.exportKey('spki', p256.publicKey));
        // X25519 has the same length and layout as Ed25519, with OID 1.3.101.110.
        const x25519 = good.publicKey.replace(/^MCowBQYDK2Vw/, 'MCowBQYDK2Vu');
        const entries = [
            'dev:hmac:6465762d68616d63',
            `p256:${p256Spki}`,
            `x25519:${x25519}`,
            `short:${good.publicKey.slice(0, 20)}`,
            `bad/id:${good.publicKey}`,
            good.publicKey,
        ];
        const { keys, rejected } = parsePublishingKeys(entries.join(','));
        expect(keys).toEqual([]);
        expect(rejected).toEqual(entries);
        expect(isEd25519PublicKey(good.publicKey)).toBe(true);
        expect(isEd25519PublicKey(x25519)).toBe(false);
        expect(isEd25519PublicKey('not base64!')).toBe(false);
    });
});

describe('outside development (a production build)', () => {
    it('refuses an HMAC key, even one in the list', async () => {
        // Made at run time: a key written in the source reads as a leaked secret
        // to a secret scanner (GitGuardian flagged the literal this replaced).
        const secret = toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
        const bundle = await signedBundle('test-key', (text) => hmacSign(secret, text));
        const keys = [{ keyId: 'test-key', publicKey: `hmac:${secret}` }];
        expect((await verifySignedBundle({ ...bundle, keys })).ok).toBe(true);

        vi.stubEnv('DEV', false);
        expect(await verifySignedBundle({ ...bundle, keys })).toEqual({
            ok: false,
            reason: 'hmac-key-refused',
            keyId: 'test-key',
        });
    });

    it('trusts no development key, and installs nothing with no key pinned', async () => {
        vi.stubEnv('DEV', false);
        vi.stubEnv('VITE_PLUGIN_PUBLISHING_KEYS', '');
        vi.resetModules();
        const signatureModule = await import(SIGNATURE_MODULE);
        expect(signatureModule.getPluginPublishingKeys()).toEqual([]);

        const devSigned = await signedBundle('fbm-dev-hmac', (text) =>
            hmacSign('6465762d68616d63', text)
        );
        expect(await signatureModule.verifySignedBundle(devSigned)).toEqual({
            ok: false,
            reason: 'no-publishing-key',
        });
    });

    it('trusts the keys the build pins', async () => {
        const key = await ed25519Key();
        vi.stubEnv('DEV', false);
        vi.stubEnv('VITE_PLUGIN_PUBLISHING_KEYS', `fbm-2026-11:${key.publicKey}`);
        vi.resetModules();
        const signatureModule = await import(SIGNATURE_MODULE);
        expect(signatureModule.getPluginPublishingKeys()).toEqual([
            { keyId: 'fbm-2026-11', publicKey: key.publicKey },
        ]);
        const bundle = await signedBundle('fbm-2026-11', key.sign);
        expect((await signatureModule.verifySignedBundle(bundle)).ok).toBe(true);
    });

    it('trusts the Ed25519 keys pinned in publishingKeys.ts, and nothing else listed there', async () => {
        const key = await ed25519Key();
        vi.doMock('../../../../src/app/features/monetization/install/publishingKeys', () => ({
            PINNED_PUBLISHING_KEYS: [
                { keyId: 'fbm-2026-11', publicKey: key.publicKey },
                { keyId: 'leaked-dev', publicKey: 'hmac:6465762d68616d63' },
                { keyId: 'bad id', publicKey: key.publicKey },
            ],
        }));
        vi.stubEnv('DEV', false);
        vi.stubEnv('VITE_PLUGIN_PUBLISHING_KEYS', '');
        vi.resetModules();
        try {
            const signatureModule = await import(SIGNATURE_MODULE);
            expect(signatureModule.getPluginPublishingKeys()).toEqual([
                { keyId: 'fbm-2026-11', publicKey: key.publicKey },
            ]);
        } finally {
            vi.doUnmock('../../../../src/app/features/monetization/install/publishingKeys');
        }
    });

    it('in development, still trusts the stub marketplace key', async () => {
        vi.resetModules();
        const signatureModule = await import(SIGNATURE_MODULE);
        const devSigned = await signedBundle('fbm-dev-hmac', (text) =>
            hmacSign('6465762d68616d63', text)
        );
        expect((await signatureModule.verifySignedBundle(devSigned)).ok).toBe(true);
    });
});

describe('what the install dialog says', () => {
    it('says why, in words, when the signature does not check out', async () => {
        setPluginPublishingKeys([]);
        vi.stubEnv('DEV', false);
        vi.stubEnv('VITE_PLUGIN_PUBLISHING_KEYS', '');
        vi.resetModules();
        const installer = await import(
            '../../../../src/app/features/monetization/install/pluginInstaller'
        );
        const key = await ed25519Key();
        const bundle = await signedBundle('fbm-2026-11', key.sign);
        const attempt = installer.installEntitlement(
            {
                id: 'ent-1',
                providerId: 'freeblackmarket',
                providerListingId: 'lst-1',
                status: 'granted',
            } as never,
            {
                fetchSignedBundle: async () => ({
                    manifest: bundle.manifest,
                    bundleBase64: toBase64(bundle.bundleBytes),
                    signature: bundle.signature,
                }),
            } as never
        );
        await expect(attempt).rejects.toMatchObject({
            name: 'PluginInstallError',
            reason: 'no-publishing-key',
            message:
                'Not installed: this copy of the app trusts no marketplace publisher yet, so it installs nothing bought from the marketplace.',
        });
    });

    it('has a sentence for every reason the check gives', () => {
        const reasons = [
            'no-publishing-key',
            'unknown-key-id',
            'hmac-key-refused',
            'manifest-sha-mismatch',
            'bundle-sha-mismatch',
            'signature-mismatch',
            'verification-error: x',
        ];
        for (const reason of reasons) {
            expect(signatureFailureMessage(reason)).toMatch(/^Not installed: .+\.$/);
            expect(signatureFailureMessage(reason)).not.toContain(reason);
        }
        expect(new Set(reasons.map(signatureFailureMessage)).size).toBe(5);
    });
});
