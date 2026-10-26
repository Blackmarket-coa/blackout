/**
 * Release keys on this device: the private halves of the person's release
 * identities and the record of whom they compared safety codes with, in
 * IndexedDB (`blackout-release-keys`), one record per Blackout account.
 *
 * Nothing here is sent anywhere. The keys are stored readable, as the
 * recovery file needs them to be, so anything that runs in this app's origin
 * can read them; and a browser that clears the site's data, or evicts it,
 * deletes them. The recovery file is the only copy elsewhere
 * (`docs/security/release-identities-2026-10-26.md` §3, §4).
 */
import type {
    ReleaseComparison,
    ReleaseKeySet,
    ReleaseRecoveryContents,
    StoredReleaseKeySet,
} from '@blackout/protocol';

export type DeviceReleaseKeys = {
    accountId: string;
    keySets: StoredReleaseKeySet[];
    comparisons: ReleaseComparison[];
    updatedAt: string;
};

export interface ReleaseKeyStore {
    load(accountId: string): Promise<DeviceReleaseKeys | null>;
    save(record: DeviceReleaseKeys): Promise<void>;
    remove(accountId: string): Promise<void>;
}

const DB_NAME = 'blackout-release-keys';
const DB_VERSION = 1;
const ACCOUNTS = 'accounts';

export const releaseKeyStoreAvailable = (): boolean => typeof indexedDB !== 'undefined';

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        if (!releaseKeyStoreAvailable()) {
            reject(new Error('This device has no IndexedDB, so it cannot keep release keys.'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(ACCOUNTS)) {
                db.createObjectStore(ACCOUNTS, { keyPath: 'accountId' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error ?? new Error('Could not open the release key store.'));
    });

const withStore = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest | null
): Promise<T> => {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(ACCOUNTS, mode);
            const request = run(tx.objectStore(ACCOUNTS));
            let result: T;
            if (request) {
                request.onsuccess = () => {
                    result = request.result as T;
                };
            }
            tx.oncomplete = () => resolve(result);
            tx.onabort = () =>
                reject(tx.error ?? new Error('Release key store transaction aborted.'));
            tx.onerror = () =>
                reject(tx.error ?? new Error('Release key store transaction failed.'));
        });
    } finally {
        db.close();
    }
};

/**
 * Ask the browser to treat this site's storage as the person's data rather
 * than evictable cache. Browsers may say no; the keys are stored either way.
 */
const requestPersistence = async (): Promise<void> => {
    try {
        await navigator.storage?.persist?.();
    } catch {
        // Persistence is an upgrade, not a requirement.
    }
};

export const indexedDbReleaseKeyStore: ReleaseKeyStore = {
    async load(accountId) {
        const record = await withStore<DeviceReleaseKeys | undefined>('readonly', (store) =>
            store.get(accountId)
        );
        return record ?? null;
    },
    async save(record) {
        await requestPersistence();
        await withStore<void>('readwrite', (store) => store.put(record));
    },
    async remove(accountId) {
        await withStore<void>('readwrite', (store) => store.delete(accountId));
    },
};

/** The key set in use: the one marked current. */
export const currentKeySet = (record: DeviceReleaseKeys | null): StoredReleaseKeySet | undefined =>
    record?.keySets.find((set) => set.status === 'current');

/** `keySet` becomes current; the one it replaces stays, marked superseded. */
export const withNewCurrentKeySet = (
    record: DeviceReleaseKeys | null,
    accountId: string,
    keySet: ReleaseKeySet,
    now: Date
): DeviceReleaseKeys => ({
    accountId,
    keySets: [
        ...(record?.keySets ?? []).map(
            (set): StoredReleaseKeySet => ({ ...set, status: 'superseded' })
        ),
        { ...keySet, status: 'current' },
    ],
    comparisons: record?.comparisons ?? [],
    updatedAt: now.toISOString(),
});

const sameComparison = (a: ReleaseComparison, b: ReleaseComparison): boolean =>
    a.accountId === b.accountId && a.fingerprint === b.fingerprint;

/** Record a comparison; one with the same person and key is replaced. */
export const withComparison = (
    record: DeviceReleaseKeys,
    comparison: ReleaseComparison,
    now: Date
): DeviceReleaseKeys => ({
    ...record,
    comparisons: [
        ...record.comparisons.filter((existing) => !sameComparison(existing, comparison)),
        comparison,
    ],
    updatedAt: now.toISOString(),
});

/**
 * Take in what a recovery file held (already checked by
 * `readRecoveryFile`): the file's current key set becomes current here; key
 * sets only this device had stay, as superseded ones; comparisons are joined,
 * the later of two for the same person and key kept.
 */
export const mergeRecoveryContents = (
    record: DeviceReleaseKeys | null,
    contents: ReleaseRecoveryContents,
    now: Date
): DeviceReleaseKeys => {
    const fromFile = new Set(contents.keySets.map((set) => set.fingerprint));
    const onlyHere = (record?.keySets ?? [])
        .filter((set) => !fromFile.has(set.fingerprint))
        .map((set): StoredReleaseKeySet => ({ ...set, status: 'superseded' }));
    const comparisons = [...(record?.comparisons ?? [])];
    for (const comparison of contents.comparisons) {
        const at = comparisons.findIndex((existing) => sameComparison(existing, comparison));
        if (at === -1) comparisons.push(comparison);
        else if (comparison.comparedAt > comparisons[at].comparedAt) comparisons[at] = comparison;
    }
    return {
        accountId: contents.accountId,
        keySets: [...onlyHere, ...contents.keySets],
        comparisons,
        updatedAt: now.toISOString(),
    };
};

/** What a recovery file saved now holds: everything this device has. */
export const toRecoveryContents = (
    record: DeviceReleaseKeys,
    now: Date
): ReleaseRecoveryContents => ({
    v: 1,
    accountId: record.accountId,
    savedAt: now.toISOString(),
    keySets: record.keySets,
    comparisons: record.comparisons,
});
