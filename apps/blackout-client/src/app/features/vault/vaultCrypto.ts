/**
 * Client-side vault crypto (Workstream 5). Plaintext never leaves the browser:
 * a passphrase-derived AES-GCM key (PBKDF2) encrypts each secret, and only the
 * resulting ciphertext + per-item nonce are sent to the server. The derivation
 * salt is generated once and persisted locally so the same passphrase unlocks
 * the vault across reloads on this device.
 */

const SALT_STORAGE_KEY = 'blackout.vault.salt.v1';
const PBKDF2_ITERATIONS = 210_000;

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
}

/** Get (or lazily create + persist) this device's vault derivation salt. */
export function getOrCreateVaultSalt(): Uint8Array {
    try {
        const existing = window.localStorage.getItem(SALT_STORAGE_KEY);
        if (existing) return base64ToBytes(existing);
    } catch {
        /* storage unavailable — fall through to ephemeral salt */
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    try {
        window.localStorage.setItem(SALT_STORAGE_KEY, bytesToBase64(salt));
    } catch {
        /* non-fatal: key just won't persist across reloads */
    }
    return salt;
}

/** Derive an AES-GCM key from a passphrase + salt. */
export async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt as globalThis.BufferSource,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export interface EncryptedBlob {
    ciphertext: string;
    iv: string;
    algo: 'AES-GCM';
}

/** Encrypt plaintext under the derived key; returns base64 ciphertext + nonce. */
export async function encryptSecret(key: CryptoKey, plaintext: string): Promise<EncryptedBlob> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as globalThis.BufferSource },
        key,
        new TextEncoder().encode(plaintext) as globalThis.BufferSource
    );
    return { ciphertext: bytesToBase64(new Uint8Array(ct)), iv: bytesToBase64(iv), algo: 'AES-GCM' };
}

/** Decrypt a stored blob; throws if the key (passphrase) is wrong. */
export async function decryptSecret(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
    const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(blob.iv) as globalThis.BufferSource },
        key,
        base64ToBytes(blob.ciphertext) as globalThis.BufferSource
    );
    return new TextDecoder().decode(pt);
}
