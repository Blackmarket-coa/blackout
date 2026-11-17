import type { PluginSignatureEnvelope } from '@blackout/sdk';
import { PINNED_PUBLISHING_KEYS } from './publishingKeys';

/**
 * The keys a marketplace bundle's signature is checked against. The client
 * refuses to install any bundle whose signature does not check out against
 * one of them.
 *
 * - `publishingKeys.ts`: Ed25519 keys pinned in the source, in every build.
 * - `VITE_PLUGIN_PUBLISHING_KEYS`: more Ed25519 keys for one build, read when
 *   it is built, as `keyId:base64-SPKI` entries separated by commas or spaces
 *   (`tools/plugins/publishing-key.mjs` prints them).
 * - `fbm-dev-hmac`: in a development build only (the Vite dev server and the
 *   tests), the HMAC secret the API's stub marketplace signs with. It is
 *   written in this file, so anyone could sign with it; a production build
 *   leaves it out and refuses every HMAC key (`hmac-key-refused`).
 *
 * Until 2026-11-17 the development key was the only key, in every build, and
 * the comment here said the real keys rotated through a well-known URL; no
 * code fetched one. A production build with no pinned key now installs
 * nothing (`no-publishing-key`).
 */
export interface PluginPublishingKey {
    /** Stable identifier the envelope names (e.g. `fbm-2026-11`). */
    keyId: string;
    /** Base64 Ed25519 SubjectPublicKeyInfo, or `hmac:<hex>` in development. */
    publicKey: string;
}

/** DER prefix of an Ed25519 SubjectPublicKeyInfo (RFC 8410); 32 key bytes follow. */
const ED25519_SPKI_PREFIX = [
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
];
const ED25519_SPKI_LENGTH = ED25519_SPKI_PREFIX.length + 32;
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Whether `value` is the base64 of an Ed25519 public key (SPKI DER). */
export function isEd25519PublicKey(value: string): boolean {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    let bytes: Uint8Array;
    try {
        bytes = base64ToBytes(value);
    } catch {
        return false;
    }
    return (
        bytes.length === ED25519_SPKI_LENGTH &&
        ED25519_SPKI_PREFIX.every((byte, index) => bytes[index] === byte)
    );
}

/**
 * Parse `keyId:base64` entries (the `VITE_PLUGIN_PUBLISHING_KEYS` format).
 * Anything that is not an Ed25519 public key under a plain key id is left out
 * and listed in `rejected`, so an HMAC secret can never be pinned this way.
 */
export function parsePublishingKeys(value: string | undefined): {
    keys: PluginPublishingKey[];
    rejected: string[];
} {
    const keys: PluginPublishingKey[] = [];
    const rejected: string[] = [];
    for (const entry of (value ?? '').split(/[\s,]+/).filter(Boolean)) {
        const colon = entry.indexOf(':');
        const keyId = colon > 0 ? entry.slice(0, colon) : '';
        const publicKey = colon > 0 ? entry.slice(colon + 1) : '';
        if (KEY_ID.test(keyId) && isEd25519PublicKey(publicKey)) keys.push({ keyId, publicKey });
        else rejected.push(entry);
    }
    return { keys, rejected };
}

const buildKeys = parsePublishingKeys(
    import.meta.env.VITE_PLUGIN_PUBLISHING_KEYS as string | undefined
);
if (buildKeys.rejected.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
        `[plugins] VITE_PLUGIN_PUBLISHING_KEYS: ignored ${buildKeys.rejected.length} entr${
            buildKeys.rejected.length === 1 ? 'y' : 'ies'
        } that are not keyId:<base64 Ed25519 public key>`
    );
}

/** The pinned keys that are Ed25519 keys; anything else in the list is ignored. */
const pinnedKeys = PINNED_PUBLISHING_KEYS.filter(
    (key) => KEY_ID.test(key.keyId) && isEd25519PublicKey(key.publicKey)
);

// `import.meta.env.DEV` is a constant in a production build, so the secret
// below is not in it.
const DEFAULT_KEYS: PluginPublishingKey[] = [
    ...pinnedKeys,
    ...buildKeys.keys,
    ...(import.meta.env.DEV
        ? [{ keyId: 'fbm-dev-hmac', publicKey: 'hmac:6465762d68616d63' /* "dev-hamc" */ }]
        : []),
];

let registeredKeys = [...DEFAULT_KEYS];

/** Tests only: replace the keys; an empty list restores the build's own. */
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
    const buffer = await crypto.subtle.digest('SHA-256', bytes as globalThis.BufferSource);
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
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`).join(',')}}`;
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
    if (keys.length === 0) return { ok: false, reason: 'no-publishing-key' };
    const key = keys.find((entry) => entry.keyId === input.signature.keyId);
    if (!key) return { ok: false, reason: 'unknown-key-id' };
    // An HMAC "public key" is a shared secret; outside development it is
    // refused however it got into the list.
    if (key.publicKey.startsWith('hmac:') && !import.meta.env.DEV) {
        return { ok: false, reason: 'hmac-key-refused', keyId: key.keyId };
    }

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
            await crypto.subtle.sign('HMAC', cryptoKey, signedPayload as globalThis.BufferSource)
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
            reason: `verification-error: ${error instanceof Error ? error.message : String(error)}`,
            keyId: key.keyId,
        };
    }
}

export const __testing = { hexToBytes, bytesToHex, canonicalJson, sha256Hex };
