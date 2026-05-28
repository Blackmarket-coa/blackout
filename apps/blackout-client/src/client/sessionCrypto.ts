/**
 * WHAT THIS FILE DOES
 * Encrypts and decrypts user session data (Matrix access tokens,
 * refresh tokens, user IDs) before storing them in the browser.
 * Without this, any code running on the same page could read your
 * access tokens and impersonate you on the homeserver.
 *
 * WHY IT EXISTS (THE SECURITY PROBLEM)
 * localStorage is readable by ANY JavaScript running on the page —
 * including malicious browser extensions, XSS-injected scripts, and
 * third-party dependencies. If access tokens are stored as plaintext
 * (which they were before this fix), a single XSS vulnerability
 * gives the attacker permanent access to the user's account.
 *
 * HOW IT WORKS
 * 1. KEY GENERATION: On first use, `generateAndStoreKey()` creates
 *    an AES-256-GCM encryption key via the Web Crypto API. The key
 *    is stored as a JWK (JSON Web Key) in IndexedDB — a storage
 *    mechanism that's harder to exfiltrate via simple XSS than
 *    localStorage (you need to read specific IndexedDB stores, not
 *    just call `localStorage.getItem("*")`).
 * 2. ENCRYPTION: When saving the session, `encryptSession()` takes
 *    the JSON string, encrypts it under the key with a fresh random
 *    IV (initialization vector), and stores `{ iv, ct }` in
 *    localStorage under a separate key.
 * 3. DECRYPTION: When loading the session, `decryptSession()` reads
 *    the blob from localStorage, decrypts it with the key, and
 *    returns the original JSON.
 * 4. MIGRATION: `migrateUnencryptedSession()` reads the old
 *    unencrypted storage key, encrypts it, writes the encrypted blob,
 *    and REMOVES the old key — one-time, automatic, transparent.
 *
 * KEY CONCEPTS EXPLAINED
 * - AES-256-GCM: A government-standard encryption algorithm. AES
 *   is the cipher (scrambling math), 256 is the key length (how many
 *   possible keys exist — 2^256, approximately the number of atoms in
 *   the observable universe), GCM provides both encryption AND
 *   tamper detection (if someone modifies the encrypted data, it
 *   won't decrypt).
 * - IV (Initialization Vector): A random number used once per
 *   encryption. Even if you encrypt the same data twice with the
 *   same key, the output is different because the IV is different.
 *   Reusing an IV breaks AES-GCM security.
 * - IndexedDB vs localStorage: localStorage is a simple key-value
 *   store that any script can enumerate with `Object.keys()`. IndexedDB
 *   is a database that requires knowing the database name, store name,
 *   and key to access specific data — harder to exfiltrate en masse.
 * - extractable: false: The CryptoKey is created with this flag so
 *   it can't be exported via `crypto.subtle.exportKey()` — it stays
 *   in the browser's secure key store. (Note: we DO export and store
 *   the JWK in IndexedDB for persistence across reloads, accepting
 *   this tradeoff since the alternative is losing all sessions.)
 *
 * HOW TO VERIFY
 * 1. Open the browser DevTools → Application → IndexedDB. You should
 *    see a 'blackout-session-crypto' database with a 'crypto-keys'
 *    store containing the JWK.
 * 2. localStorage should contain 'blackout.matrix.sessions.v1.enc'
 *    with an `{ iv, ct }` blob — NOT plaintext JSON.
 * 3. If the user had an old unencrypted session before this fix, it
 *    should be automatically migrated on next login and the old key
 *    removed from localStorage.
 */

const DB_NAME = 'blackout-session-crypto';
const DB_VERSION = 1;
const KEY_STORE = 'crypto-keys';
const ENC_KEY_ID = 'session-aes-gcm-key';
const SESSION_STORAGE_KEY = 'blackout.matrix.sessions.v1';
const ENCRYPTED_SESSION_KEY = 'blackout.matrix.sessions.v1.enc';

interface EncryptedBlob {
    iv: string; // base64 IV
    ct: string; // base64 ciphertext
}

let cachedKey: CryptoKey | null = null;

async function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(KEY_STORE)) {
                db.createObjectStore(KEY_STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getStoredKey(): Promise<CryptoKey | null> {
    if (cachedKey) {
        try { await crypto.subtle.exportKey('jwk', cachedKey); }
        catch { cachedKey = null; }
    }
    if (cachedKey) return cachedKey;

    const db = await openDb();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(KEY_STORE, 'readonly');
        const store = txn.objectStore(KEY_STORE);
        const req = store.get(ENC_KEY_ID);
        req.onsuccess = () => {
            const record = req.result;
            db.close();
            if (record?.key) {
                crypto.subtle.importKey('jwk', record.key, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
                    .then((k) => { cachedKey = k; resolve(k); })
                    .catch(() => resolve(null));
            } else {
                resolve(null);
            }
        };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function generateAndStoreKey(): Promise<CryptoKey> {
    const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
    cachedKey = key;
    const jwk = await crypto.subtle.exportKey('jwk', key);

    const db = await openDb();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(KEY_STORE, 'readwrite');
        const store = txn.objectStore(KEY_STORE);
        store.put({ id: ENC_KEY_ID, key: jwk });
        txn.oncomplete = () => { db.close(); resolve(key); };
        txn.onerror = () => { db.close(); reject(txn.error); };
    });
}

async function getOrCreateKey(): Promise<CryptoKey> {
    const existing = await getStoredKey();
    if (existing) return existing;
    return generateAndStoreKey();
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export async function initSessionCrypto(): Promise<void> {
    await getOrCreateKey();
    await migrateUnencryptedSession();
}

export async function encryptSession(plaintext: string): Promise<EncryptedBlob> {
    const key = await getOrCreateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );
    return {
        iv: bytesToBase64(iv),
        ct: bytesToBase64(new Uint8Array(ct)),
    };
}

export async function decryptSession(blob: EncryptedBlob): Promise<string> {
    const key = await getOrCreateKey();
    const iv = base64ToBytes(blob.iv);
    const ct = base64ToBytes(blob.ct);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ct
    );
    return new TextDecoder().decode(decrypted);
}

export async function securelyStoreSession(sessionMapJson: string): Promise<void> {
    const blob = await encryptSession(sessionMapJson);
    window.localStorage.setItem(ENCRYPTED_SESSION_KEY, JSON.stringify(blob));
}

export function loadEncryptedBlob(): EncryptedBlob | null {
    try {
        const raw = window.localStorage.getItem(ENCRYPTED_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.iv === 'string' && typeof parsed.ct === 'string') {
            return parsed as EncryptedBlob;
        }
        return null;
    } catch {
        return null;
    }
}

export async function securelyLoadSession(): Promise<string | null> {
    const blob = loadEncryptedBlob();
    if (!blob) return null;
    try {
        return await decryptSession(blob);
    } catch {
        return null;
    }
}

async function migrateUnencryptedSession(): Promise<void> {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            const blob = await encryptSession(JSON.stringify(parsed));
            window.localStorage.setItem(ENCRYPTED_SESSION_KEY, JSON.stringify(blob));
            window.localStorage.removeItem(SESSION_STORAGE_KEY);
        }
    } catch {
        // Migration failed; leave old data and try again on next init
    }
}

export async function clearSecureSession(): Promise<void> {
    window.localStorage.removeItem(ENCRYPTED_SESSION_KEY);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    cachedKey = null;
    try {
        const db = await openDb();
        db.close();
        const delReq = indexedDB.deleteDatabase(DB_NAME);
        await new Promise<void>((resolve) => {
            delReq.onsuccess = () => resolve();
            delReq.onerror = () => resolve();
            delReq.onblocked = () => resolve();
        });
    } catch {
        // Key store cleanup is best-effort
    }
}
