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
import {
    publicReleaseIdentity,
    type ReleaseComparison,
    type ReleaseIdentity,
    type ReleaseKeySet,
    type ReleaseRecoveryContents,
    type StoredReleaseKeySet,
} from '@blackout/protocol';

export type DeviceReleaseKeys = {
    accountId: string;
    keySets: StoredReleaseKeySet[];
    comparisons: ReleaseComparison[];
    updatedAt: string;
};

/**
 * What a change to the stored record returns: the record to store, or
 * `undefined` to leave what is stored as it is.
 */
export type ReleaseKeysChange = (stored: DeviceReleaseKeys | null) => DeviceReleaseKeys | undefined;

export interface ReleaseKeyStore {
    load(accountId: string): Promise<DeviceReleaseKeys | null>;
    /**
     * Read the stored record, compute the next one from it with `change` and
     * write that, all in one readwrite transaction, so that a change another
     * tab or window made in the meantime is what `change` starts from rather
     * than something a stale copy overwrites (the independent review's M3).
     * `change` must not await anything: the transaction ends once it returns.
     * Resolves to the record stored afterwards.
     */
    update(accountId: string, change: ReleaseKeysChange): Promise<DeviceReleaseKeys | null>;
    /**
     * Delete the account's record, in one transaction with reading it, and
     * only if it is still exactly `expected` (when given): a record changed
     * elsewhere since the caller read it is left alone, and this resolves to
     * false.
     */
    remove(accountId: string, expected?: DeviceReleaseKeys | null): Promise<boolean>;
}

/**
 * Whether two copies of a record hold the same things. IndexedDB returns a
 * structured clone, which keeps property order, so the JSON forms match
 * exactly when the contents do.
 */
export const sameDeviceRecord = (
    a: DeviceReleaseKeys | null,
    b: DeviceReleaseKeys | null
): boolean => JSON.stringify(a) === JSON.stringify(b);

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
 * One readwrite transaction: read the account's record, then let `decide`
 * act on it with the same store before the transaction commits. Whatever
 * `decide` returns is what this resolves to once the transaction completes.
 */
const readThenWrite = async <T>(
    accountId: string,
    decide: (stored: DeviceReleaseKeys | null, store: IDBObjectStore) => T
): Promise<T> => {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(ACCOUNTS, 'readwrite');
            const store = tx.objectStore(ACCOUNTS);
            let result: T;
            let failure: unknown;
            const read = store.get(accountId);
            read.onsuccess = () => {
                try {
                    result = decide((read.result as DeviceReleaseKeys | undefined) ?? null, store);
                } catch (cause) {
                    failure = cause;
                    tx.abort();
                }
            };
            tx.oncomplete = () => resolve(result);
            tx.onabort = () =>
                reject(failure ?? tx.error ?? new Error('Release key store transaction aborted.'));
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

export const indexedDbReleaseKeyStore: ReleaseKeyStore & {
    /**
     * Replace the record whatever is stored. Only for seeding a store (tests,
     * tools); the screen writes through `update`, which cannot lose a change
     * made elsewhere.
     */
    save(record: DeviceReleaseKeys): Promise<void>;
} = {
    async load(accountId) {
        const record = await withStore<DeviceReleaseKeys | undefined>('readonly', (store) =>
            store.get(accountId)
        );
        return record ?? null;
    },
    async update(accountId, change) {
        await requestPersistence();
        return readThenWrite(accountId, (stored, store) => {
            const next = change(stored);
            if (next === undefined) return stored;
            if (next.accountId !== accountId) {
                throw new Error('release keys: a record must stay under its own account');
            }
            store.put(next);
            return next;
        });
    },
    async remove(accountId, expected) {
        return readThenWrite(accountId, (stored, store) => {
            if (expected !== undefined && !sameDeviceRecord(stored, expected)) return false;
            store.delete(accountId);
            return true;
        });
    },
    async save(record) {
        await requestPersistence();
        await withStore<void>('readwrite', (store) => store.put(record));
    },
};

/**
 * Delete every account's release keys and comparisons from this device in one
 * transaction: the panic wipe's opt-in. Clearing the object store, rather
 * than deleting the database, is not held up by another tab's open
 * connection. Rejects if the store cannot be cleared, so the caller can say
 * the keys are still there.
 */
export const removeAllReleaseKeys = async (): Promise<void> => {
    if (!releaseKeyStoreAvailable()) return;
    await withStore<void>('readwrite', (store) => store.clear());
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

/** Which key set stays current when a recovery file is taken in. */
export type RecoveryCurrentChoice = 'device' | 'file';

/** Whether two identities are the same, field by field; never by a stated fingerprint. */
export const sameReleaseIdentity = (a: ReleaseIdentity, b: ReleaseIdentity): boolean =>
    JSON.stringify(publicReleaseIdentity(a)) === JSON.stringify(publicReleaseIdentity(b));

/** What the directory says about this account, as identities. */
export type ServerReleaseKeys = {
    current: ReleaseIdentity | null;
    superseded: readonly ReleaseIdentity[];
};

/**
 * What loading a recovery file may do to this device's current key set.
 * `adopt`: the file's current key set may become current without asking:
 * this device has none, or the file's is newer (created later), is the key
 * the server has as current, and neither this device nor the server lists it
 * as replaced. `same`: both have the same current key set. `ask`: anything
 * else. The file's is older, or was replaced, so making it current would
 * quietly bring back a key the person moved away from (the independent
 * review's M4); or it is a key neither this device nor the server knows, and
 * its creation time, which nothing signs, is all that says it is newer (the
 * re-check). The screen asks first, and keeps this device's unless told
 * otherwise. The server's keys are compared as identities, never by the
 * fingerprints it states.
 */
export type RecoveryLoadPlan =
    | { kind: 'adopt' }
    | { kind: 'same' }
    | {
          kind: 'ask';
          reason: 'older' | 'replaced' | 'unknown';
          device: StoredReleaseKeySet;
          file: StoredReleaseKeySet;
      };

export const planRecoveryLoad = (
    record: DeviceReleaseKeys | null,
    contents: ReleaseRecoveryContents,
    server: ServerReleaseKeys = { current: null, superseded: [] }
): RecoveryLoadPlan => {
    const here = currentKeySet(record);
    const fromFile = contents.keySets.find((set) => set.status === 'current');
    if (!here || !fromFile) return { kind: 'adopt' };
    if (here.fingerprint === fromFile.fingerprint) return { kind: 'same' };
    const replaced =
        server.superseded.some((identity) => sameReleaseIdentity(identity, fromFile.identity)) ||
        (record?.keySets ?? []).some(
            (set) => set.fingerprint === fromFile.fingerprint && set.status === 'superseded'
        );
    if (replaced) return { kind: 'ask', reason: 'replaced', device: here, file: fromFile };
    const fileTime = Date.parse(fromFile.createdAt);
    const hereTime = Date.parse(here.createdAt);
    const newer = Number.isFinite(fileTime) && Number.isFinite(hereTime) && fileTime > hereTime;
    if (!newer) return { kind: 'ask', reason: 'older', device: here, file: fromFile };
    const serversCurrent =
        server.current !== null && sameReleaseIdentity(server.current, fromFile.identity);
    if (serversCurrent) return { kind: 'adopt' };
    return { kind: 'ask', reason: 'unknown', device: here, file: fromFile };
};

/**
 * Take in what a recovery file held (already checked by
 * `readRecoveryFile`). With `current: 'file'` the file's current key set
 * becomes current here and the key sets only this device had stay, as
 * superseded ones. With `current: 'device'` this device's key sets keep their
 * places and the file's other key sets are added, superseded. Either way the
 * comparisons are joined, the later of two for the same person and key kept.
 * `planRecoveryLoad` says which choice needs asking for.
 */
export const mergeRecoveryContents = (
    record: DeviceReleaseKeys | null,
    contents: ReleaseRecoveryContents,
    now: Date,
    current: RecoveryCurrentChoice
): DeviceReleaseKeys => {
    const comparisons = [...(record?.comparisons ?? [])];
    for (const comparison of contents.comparisons) {
        const at = comparisons.findIndex((existing) => sameComparison(existing, comparison));
        if (at === -1) comparisons.push(comparison);
        else if (comparison.comparedAt > comparisons[at].comparedAt) comparisons[at] = comparison;
    }
    const keepHere = current === 'device' && currentKeySet(record) !== undefined;
    let keySets: StoredReleaseKeySet[];
    if (keepHere) {
        const here = new Set((record?.keySets ?? []).map((set) => set.fingerprint));
        keySets = [
            ...(record?.keySets ?? []),
            ...contents.keySets
                .filter((set) => !here.has(set.fingerprint))
                .map((set): StoredReleaseKeySet => ({ ...set, status: 'superseded' })),
        ];
    } else {
        const fromFile = new Set(contents.keySets.map((set) => set.fingerprint));
        keySets = [
            ...(record?.keySets ?? [])
                .filter((set) => !fromFile.has(set.fingerprint))
                .map((set): StoredReleaseKeySet => ({ ...set, status: 'superseded' })),
            ...contents.keySets,
        ];
    }
    return {
        accountId: contents.accountId,
        keySets,
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
