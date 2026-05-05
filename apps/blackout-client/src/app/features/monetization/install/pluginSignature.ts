import type { PluginSignatureEnvelope } from '@blackout/sdk';

/**
 * Pinned publishing keys for marketplace artifacts. The blackout client
 * refuses to install any bundle whose signature cannot be matched to one
 * of these public keys. Real values rotate via the
 * /.well-known/freeblackmarket-publishing-keys.json endpoint and are
 * expected to be embedded into the build at release time.
 */
export interface PluginPublishingKey {
    /** Stable identifier (e.g. `fbm-2026-q2`). */
    keyId: string;
    /** Base64 SPKI Ed25519 or HMAC fallback (`hmac:<hex>`). */
    publicKey: string;
}

const DEFAULT_KEYS: PluginPublishingKey[] = [
    {
        keyId: 'fbm-dev-hmac',
        publicKey:
            typeof process !== 'undefined' && process.env?.BLACKOUT_PLUGIN_DEV_HMAC
                ? `hmac:${process.env.BLACKOUT_PLUGIN_DEV_HMAC}`
                : 'hmac:6465762d68616d63', // ascii "dev-hamc" — replaced at release.
    },
];

let registeredKeys = [...DEFAULT_KEYS];

export function setPluginPublishingKeys(keys: PluginPublishingKey[]): void {
    registeredKeys = keys.length > 0 ? [...keys] : [...DEFAULT_KEYS];
}

export function getPluginPublishingKeys(): PluginPublishingKey[] {
    return [...registeredKeys];
}

function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error('hex must have even length');
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function bytesToHex(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
    return diff === 0;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const buffer = await crypto.subtle.digest(
        'SHA-256',
        bytes as globalThis.BufferSource
    );
    return bytesToHex(new Uint8Array(buffer));
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
}

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`)
        .join(',')}}`;
}

export async function canonicalManifestSha256(manifest: unknown): Promise<string> {
    const encoded = new TextEncoder().encode(canonicalJson(manifest));
    return sha256Hex(encoded);
}

export interface VerifyBundleInput {
    manifest: unknown;
    bundleBytes: Uint8Array;
    signature: PluginSignatureEnvelope;
    keys?: PluginPublishingKey[];
}

export interface VerifyBundleResult {
    ok: boolean;
    reason?: string;
    keyId?: string;
}

export async function verifySignedBundle(input: VerifyBundleInput): Promise<VerifyBundleResult> {
    const keys = input.keys ?? registeredKeys;
    const key = keys.find((entry) => entry.keyId === input.signature.keyId);
    if (!key) return { ok: false, reason: 'unknown-key-id' };

    const manifestSha = await canonicalManifestSha256(input.manifest);
    if (manifestSha !== input.signature.manifestSha256) {
        return { ok: false, reason: 'manifest-sha-mismatch', keyId: key.keyId };
    }

    const bundleSha = await sha256Hex(input.bundleBytes);
    if (bundleSha !== input.signature.sha256) {
        return { ok: false, reason: 'bundle-sha-mismatch', keyId: key.keyId };
    }

    const signedPayload = new TextEncoder().encode(
        `${input.signature.manifestSha256}:${input.signature.sha256}`
    );

    if (key.publicKey.startsWith('hmac:')) {
        const secretHex = key.publicKey.slice('hmac:'.length);
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            hexToBytes(secretHex) as globalThis.BufferSource,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign', 'verify']
        );
        const expected = new Uint8Array(
            await crypto.subtle.sign(
                'HMAC',
                cryptoKey,
                signedPayload as globalThis.BufferSource
            )
        );
        const provided = hexToBytes(input.signature.signature);
        return timingSafeEqual(expected, provided)
            ? { ok: true, keyId: key.keyId }
            : { ok: false, reason: 'signature-mismatch', keyId: key.keyId };
    }

    try {
        const cryptoKey = await crypto.subtle.importKey(
            'spki',
            base64ToBytes(key.publicKey) as globalThis.BufferSource,
            { name: 'Ed25519' },
            false,
            ['verify']
        );
        const verified = await crypto.subtle.verify(
            'Ed25519',
            cryptoKey,
            base64ToBytes(input.signature.signature) as globalThis.BufferSource,
            signedPayload as globalThis.BufferSource
        );
        return verified
            ? { ok: true, keyId: key.keyId }
            : { ok: false, reason: 'signature-mismatch', keyId: key.keyId };
    } catch (error) {
        return {
            ok: false,
            reason: `verification-error: ${
                error instanceof Error ? error.message : String(error)
            }`,
            keyId: key.keyId,
        };
    }
}

export const __testing = { hexToBytes, bytesToHex, canonicalJson, sha256Hex };
