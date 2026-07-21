/**
 * Device-side vault for original video recordings (device-master posture):
 * the full-quality original never leaves this device — posting uploads only a
 * compressed rendition, and server copies may expire under media retention.
 * The vault is what makes that safe: originals stay listable and repostable.
 *
 * Storage is IndexedDB in both browser and Capacitor shells. Blobs are stored
 * natively (no base64 round-trip, so multi-hundred-MB camera files never have
 * to fit in a JS string), and metadata lives in a separate object store so
 * listing the library never pages video bytes into memory. On first save we
 * ask for persistent storage so the OS treats the vault as user data rather
 * than evictable cache.
 */

export interface LocalVideoEntry {
    id: string;
    title: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    durationSeconds?: number;
    /** ISO timestamp of when the original was saved into the vault. */
    savedAt: string;
    /** ISO timestamp of the most recent post made from this original. */
    lastPostedAt?: string;
}

const DB_NAME = 'blackout-video-vault';
const DB_VERSION = 1;
const ENTRIES_STORE = 'entries';
const BLOBS_STORE = 'blobs';

export const localVideoVaultSupported = (): boolean => typeof indexedDB !== 'undefined';

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        if (!localVideoVaultSupported()) {
            reject(new Error('This device does not support the local video vault.'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
                db.createObjectStore(ENTRIES_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(BLOBS_STORE)) {
                db.createObjectStore(BLOBS_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error ?? new Error('Could not open the video vault.'));
    });

const requestDone = <T>(request: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Vault request failed.'));
    });

const txDone = (tx: IDBTransaction): Promise<void> =>
    new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('Vault transaction aborted.'));
        tx.onerror = () => reject(tx.error ?? new Error('Vault transaction failed.'));
    });

const withDb = async <T>(
    mode: IDBTransactionMode,
    run: (tx: IDBTransaction) => Promise<T>
): Promise<T> => {
    const db = await openDb();
    try {
        const tx = db.transaction([ENTRIES_STORE, BLOBS_STORE], mode);
        const result = await run(tx);
        await txDone(tx);
        return result;
    } finally {
        db.close();
    }
};

const newEntryId = (): string => {
    const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
    return `lv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Best-effort durability upgrade: without persistence the OS may evict
 * IndexedDB under storage pressure; with it the vault is treated as user
 * data. Failure is fine — the vault still works, just less durably.
 */
const requestPersistence = async (): Promise<void> => {
    try {
        await navigator.storage?.persist?.();
    } catch {
        // Ignore — persistence is an upgrade, not a requirement.
    }
};

export interface SaveLocalVideoInput {
    title: string;
    filename: string;
    contentType: string;
    durationSeconds?: number;
}

/** Save an original recording into the vault and return its catalog entry. */
export async function saveLocalVideo(
    blob: Blob,
    input: SaveLocalVideoInput
): Promise<LocalVideoEntry> {
    await requestPersistence();
    const entry: LocalVideoEntry = {
        id: newEntryId(),
        title: input.title,
        filename: input.filename,
        contentType: input.contentType || blob.type || 'video/mp4',
        sizeBytes: blob.size,
        durationSeconds: input.durationSeconds,
        savedAt: new Date().toISOString(),
    };
    await withDb('readwrite', async (tx) => {
        tx.objectStore(ENTRIES_STORE).put(entry);
        tx.objectStore(BLOBS_STORE).put(blob, entry.id);
    });
    return entry;
}

/** Catalog of saved originals, newest first. Never loads video bytes. */
export async function listLocalVideos(): Promise<LocalVideoEntry[]> {
    const entries = await withDb('readonly', (tx) =>
        requestDone(tx.objectStore(ENTRIES_STORE).getAll() as IDBRequest<LocalVideoEntry[]>)
    );
    return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Load the original bytes for one entry (e.g. to repost after server expiry). */
export async function loadLocalVideoBlob(id: string): Promise<Blob | null> {
    const blob = await withDb('readonly', (tx) =>
        requestDone(tx.objectStore(BLOBS_STORE).get(id) as IDBRequest<Blob | undefined>)
    );
    return blob ?? null;
}

/** Remove an original (and its bytes) from the vault. */
export async function removeLocalVideo(id: string): Promise<void> {
    await withDb('readwrite', async (tx) => {
        tx.objectStore(ENTRIES_STORE).delete(id);
        tx.objectStore(BLOBS_STORE).delete(id);
    });
}

/** Stamp an entry as posted so the library can show repost state. */
export async function markLocalVideoPosted(id: string): Promise<void> {
    await withDb('readwrite', async (tx) => {
        const store = tx.objectStore(ENTRIES_STORE);
        const entry = await requestDone(store.get(id) as IDBRequest<LocalVideoEntry | undefined>);
        if (!entry) return;
        store.put({ ...entry, lastPostedAt: new Date().toISOString() });
    });
}
