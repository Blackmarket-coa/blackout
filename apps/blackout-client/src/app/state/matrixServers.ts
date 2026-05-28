import {
    atomWithLocalStorage,
    getLocalStorageItem,
    setLocalStorageItem,
} from './utils/atomWithLocalStorage';

export interface SavedHomeserver {
    /** Server name as a hostname, used for display + the login picker. */
    serverName: string;
    /** Resolved Matrix client base URL (always includes scheme). */
    baseUrl: string;
    /** Epoch ms when the user added the server. */
    addedAt: number;
}

export const SAVED_HOMESERVERS_KEY = 'blackout.matrix.homeservers.v1';

const isSavedHomeserver = (value: unknown): value is SavedHomeserver => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<SavedHomeserver>;
    return typeof candidate.serverName === 'string' && typeof candidate.baseUrl === 'string';
};

const readList = (key: string): SavedHomeserver[] => {
    const list = getLocalStorageItem<SavedHomeserver[]>(key, []);
    return Array.isArray(list) ? list.filter(isSavedHomeserver) : [];
};

/**
 * User-added Matrix homeservers, persisted to localStorage so they survive
 * reloads and are visible on the pre-auth login screen (which reads them
 * directly via {@link readSavedHomeservers}) as well as in Settings (which
 * uses the reactive atom).
 */
export const savedHomeserversAtom = atomWithLocalStorage<SavedHomeserver[]>(
    SAVED_HOMESERVERS_KEY,
    readList,
    (key, value) => setLocalStorageItem(key, value)
);

/** Synchronous read for surfaces that run before the Jotai store exists. */
export const readSavedHomeservers = (): SavedHomeserver[] => readList(SAVED_HOMESERVERS_KEY);
