// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
    PANIC_INTRO,
    PANIC_KEEPS,
    PANIC_NOT_FORENSIC,
    PANIC_REMOVES,
    PANIC_SIGN_IN_DETAIL,
    PANIC_SIGN_IN_OPTION,
    PANIC_SIGN_IN_REMOVES,
    PanicSettings,
} from '../../../../src/app/features/panic/PanicSettings';
import {
    type KeyValueStore,
    SENSITIVE_TRACE_PREFIXES,
    SESSION_PREFIXES,
} from '../../../../src/app/features/panic/localTraces';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** One real key per wiped prefix, as the features that own them write them. */
const REMOVED = [
    'blackout.draft.!room1:hs',
    'blackout.burners.v1',
    'blackout.burner.primary.v1',
    'blackout.settings.steganography.v1',
    'blackout.settings.steganography.enterprise-policy.v1',
    'blackout.settings.data-deletion.v1',
    'blackout.ephemeral.views.v1',
    'blackout.timeline.scroll.v1',
];

/** The full app's and the chat panel's sign-ins (`storageNamespace.ts`). */
const SIGN_INS = [
    'blackout.matrix.sessions.v1',
    'blackout.matrix.sessions.embed.v1',
    'blackout.api.token',
    'blackout.api.token.embed',
];

/** Keys behind the screen's "What stays" examples, which the wipe must leave. */
const KEPT = [
    'blackout.settings.appearance.v1',
    'blackout.roomNotificationOverrides.v1',
    'blackout.reactions.recent',
    'blackout.gif_recents.v1',
    'blackout.matrix.homeservers.v1',
    'mxjssdk_memory_filter_FILTER_SYNC_@me:hs',
];

/** The Matrix client's IndexedDB databases (`initMatrix.ts`) and the video vault. */
const KEPT_DATABASES = [
    'matrix-js-sdk:blackout-sync-store:@me:hs:DEVICE',
    'blackout-crypto-store:@me:hs:DEVICE',
    'matrix-js-sdk::matrix-sdk-crypto',
    'matrix-js-sdk::matrix-sdk-crypto-meta',
    'blackout-video-vault',
];

const mapStore = (keys: string[]): KeyValueStore & { keys(): string[] } => {
    const map = new Map(keys.map((key) => [key, 'value']));
    return {
        get length() {
            return map.size;
        },
        key: (index: number) => [...map.keys()][index] ?? null,
        removeItem: (key: string) => {
            map.delete(key);
        },
        keys: () => [...map.keys()].sort(),
    };
};

const openDatabase = (name: string) =>
    new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('entries');
        request.onsuccess = () => {
            request.result.close();
            resolve();
        };
        request.onerror = () => reject(request.error);
    });

let container: HTMLDivElement;
let root: ReactDOM.Root;

const text = () => container.textContent ?? '';

const render = async (props: React.ComponentProps<typeof PanicSettings>) => {
    await act(async () => {
        root.render(<PanicSettings {...props} />);
    });
};

const click = async (label: string) => {
    const found = Array.from(container.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === label
    );
    if (!found) throw new Error(`no button "${label}"; screen says: ${text().slice(0, 600)}`);
    await act(async () => {
        found.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
};

const tickSignIns = async () => {
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!box) throw new Error('no checkbox');
    await act(async () => {
        box.click();
    });
};

beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'indexedDB');
});

describe('Settings → Panic wipe says exactly what it removes', () => {
    it('has one line for every prefix the wipe removes, and no more', () => {
        expect(Object.keys(PANIC_REMOVES).sort()).toEqual([...SENSITIVE_TRACE_PREFIXES].sort());
        expect(Object.keys(PANIC_SIGN_IN_REMOVES).sort()).toEqual([...SESSION_PREFIXES].sort());
    });

    it('lists what it removes and what stays, and no longer claims to clear the app’s sensitive data', async () => {
        await render({ storage: mapStore([]), reload: () => undefined });
        expect(text()).toContain(PANIC_INTRO);
        for (const line of Object.values(PANIC_REMOVES)) expect(text()).toContain(line);
        for (const line of PANIC_KEEPS) expect(text()).toContain(line);
        expect(text()).toContain(PANIC_NOT_FORENSIC);
        expect(text()).toContain('encryption keys that decrypt your messages');
        expect(text()).toContain('video vault');
        // The headline before this change claimed more than the wipe does.
        expect(text()).not.toContain('Immediately clear sensitive data');
        expect(text()).not.toContain('Also sign out');
        // The sign-in lines appear only once the box is ticked.
        for (const line of Object.values(PANIC_SIGN_IN_REMOVES)) {
            expect(text()).not.toContain(line);
        }
    });

    it('says the sign-in option does not end the sessions on the homeserver', async () => {
        await render({ storage: mapStore([]), reload: () => undefined });
        expect(text()).toContain(PANIC_SIGN_IN_OPTION);
        expect(PANIC_SIGN_IN_DETAIL).toContain('The homeserver is not told');
        expect(text()).toContain(PANIC_SIGN_IN_DETAIL);
        await tickSignIns();
        for (const line of Object.values(PANIC_SIGN_IN_REMOVES)) expect(text()).toContain(line);
    });
});

describe('Settings → Panic wipe does what the screen says', () => {
    it('removes exactly the listed entries, and leaves the sign-ins and the rest', async () => {
        const storage = mapStore([...REMOVED, ...SIGN_INS, ...KEPT]);
        const reload = vi.fn();
        await render({ storage, reload });
        await click('Wipe the items listed…');
        await click('Wipe now');
        expect(storage.keys()).toEqual([...SIGN_INS, ...KEPT].sort());
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('with the box ticked, also forgets the sign-ins, and still leaves the rest', async () => {
        const storage = mapStore([...REMOVED, ...SIGN_INS, ...KEPT]);
        const reload = vi.fn();
        await render({ storage, reload });
        await tickSignIns();
        await click('Wipe the items listed…');
        await click('Wipe and forget sign-ins');
        expect(storage.keys()).toEqual([...KEPT].sort());
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('leaves the Matrix client’s IndexedDB stores and the video vault, as the screen says', async () => {
        for (const name of KEPT_DATABASES) await openDatabase(name);
        for (const key of [...REMOVED, ...SIGN_INS]) window.localStorage.setItem(key, 'value');
        const reload = vi.fn();
        // No storage passed: the wipe runs on the page's own localStorage.
        await render({ reload });
        await tickSignIns();
        await click('Wipe the items listed…');
        await click('Wipe and forget sign-ins');
        expect(reload).toHaveBeenCalledTimes(1);
        for (const key of [...REMOVED, ...SIGN_INS]) {
            expect(window.localStorage.getItem(key)).toBeNull();
        }
        const left = (await indexedDB.databases()).map((db) => db.name).sort();
        expect(left).toEqual([...KEPT_DATABASES].sort());
    });
});
