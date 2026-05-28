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
        try { await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, cachedKey, new Uint8Array(1)); }
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
