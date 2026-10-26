// @vitest-environment jsdom
/**
 * Two tabs of Settings → Release keys on one device, sharing one IndexedDB
 * store: the independent review's M3. Each tab holds its own copy of the
 * device's record; before the fix, a tab built its next record from that
 * copy and wrote it whole, so a stale tab could erase keys another tab had
 * just made, or bring back keys another tab had removed. The re-check's N1
 * and N3 are the same for publishing and saving a recovery file.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
    createReleaseKeySet,
    mlKem768Provider,
    NULL_KEM_PROVIDER,
    readRecoveryFile,
    setKemProvider,
    verifyReleaseIdentity,
    type ReleaseIdentity,
    type ReleaseIdentityDirectoryEntry,
} from '@blackout/protocol';
import { BlackoutSdkError, type ApiClient, type ApiRequest } from '@blackout/sdk';
import {
    CHANGED_ELSEWHERE_NOT_PUBLISHED,
    CHANGED_ELSEWHERE_NOT_RECORDED,
    CHANGED_ELSEWHERE_NOT_REMOVED,
    COMPARED_WITH_OLD_KEY,
    ReleaseKeysPanel,
    SAVED_STORED_KEYS,
} from '../../../../src/app/features/release-keys/ReleaseKeysPanel';
import {
    currentKeySet,
    indexedDbReleaseKeyStore,
    withNewCurrentKeySet,
} from '../../../../src/app/features/release-keys/releaseKeyStore';
import { ALICE, BOB } from '../../../../../../packages/blackout-protocol/src/release/testVectors';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT = ALICE.identity.accountId;
const NOW = new Date('2026-10-26T12:00:00Z');

const entryFor = (
    accountId: string,
    matrixId: string,
    identity: ReleaseIdentity | null,
    fingerprint: string
): ReleaseIdentityDirectoryEntry => ({
    accountId,
    matrixId,
    current: identity ? { identity, fingerprint, publishedAt: NOW.toISOString() } : null,
    superseded: [],
});

/** One server for both tabs. */
const fakeApi = () => {
    let mine = entryFor(ACCOUNT, '@alice:test.local', ALICE.identity, ALICE.fingerprint);
    const published: ReleaseIdentity[] = [];
    const client: ApiClient = async <T,>(request: ApiRequest): Promise<T> => {
        if (request.method === 'GET' && request.path === '/v1/release-identities/me') {
            return mine as T;
        }
        if (request.method === 'PUT' && request.path === '/v1/release-identities/me') {
            const { identity } = request.body as { identity: ReleaseIdentity };
            const check = await verifyReleaseIdentity(identity, { accountId: ACCOUNT });
            if (!check.ok) throw new BlackoutSdkError('HTTP_REQUEST_FAILED', '400', 'fatal', 400);
            published.push(identity);
            mine = entryFor(ACCOUNT, '@alice:test.local', identity, check.fingerprint);
            return { ...mine, changed: true } as T;
        }
        if (request.method === 'POST' && request.path === '/v1/release-identities/lookup') {
            const { matrixId } = request.body as { matrixId: string };
            if (matrixId === '@bob:test.local') {
                return entryFor(
                    BOB.identity.accountId,
                    '@bob:test.local',
                    BOB.identity,
                    BOB.fingerprint
                ) as T;
            }
            throw new BlackoutSdkError('HTTP_REQUEST_FAILED', '404', 'fatal', 404);
        }
        throw new Error(`unexpected request ${request.method} ${request.path}`);
    };
    return { client, published, current: () => mine.current };
};

type Tab = { container: HTMLDivElement; root: ReactDOM.Root };

const openTab = async (
    apiClient: ApiClient,
    saveFile: (name: string, contents: string) => void = () => undefined
): Promise<Tab> => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <ReleaseKeysPanel
                apiClient={apiClient}
                checkSupport={async () => true}
                saveFile={saveFile}
                now={() => NOW}
            />
        );
    });
    return { container, root };
};

const text = (tab: Tab) => tab.container.textContent ?? '';

const waitFor = async (tab: Tab, check: () => boolean, what: string, timeoutMs = 4_000) => {
    const started = Date.now();
    while (!check()) {
        if (Date.now() - started > timeoutMs) {
            throw new Error(`timed out waiting for ${what}; tab says: ${text(tab).slice(-900)}`);
        }
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25));
        });
    }
};

const click = async (tab: Tab, label: string) => {
    const found = Array.from(tab.container.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === label
    );
    if (!found) throw new Error(`no button "${label}"; tab says: ${text(tab).slice(0, 600)}`);
    await act(async () => {
        found.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
};

const type = async (tab: Tab, label: string, value: string) => {
    const input = Array.from(tab.container.querySelectorAll('label'))
        .find((candidate) => candidate.textContent?.trim().startsWith(label))
        ?.querySelector('input');
    if (!input) throw new Error(`no input "${label}"`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
};

const ownFingerprint = (tab: Tab) =>
    tab.container.querySelector('[data-testid="own-fingerprint"]')?.textContent?.replace(/ /g, '');

/** Tab B looks Bob up and says the codes match, from its own (maybe stale) copy. */
const compareWithBob = async (tab: Tab) => {
    await type(tab, 'Their Matrix id', '@bob:test.local');
    await click(tab, 'Show the code');
    await waitFor(
        tab,
        () => Boolean(tab.container.querySelector('[data-testid="safety-code"]')),
        'the code'
    );
    await click(tab, 'The codes match');
};

/** Tab A replaces the keys and publishes the new ones. */
const replaceKeys = async (tab: Tab) => {
    await click(tab, 'Create and publish new release keys');
    await click(tab, 'Create and publish new keys');
    await waitFor(
        tab,
        () => ownFingerprint(tab) !== ALICE.fingerprint && text(tab).includes('Published'),
        'the new keys',
        20_000
    );
    return ownFingerprint(tab);
};

let tabs: Tab[] = [];

beforeEach(async () => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
    setKemProvider(mlKem768Provider);
    await indexedDbReleaseKeyStore.save(
        withNewCurrentKeySet(
            null,
            ACCOUNT,
            {
                identity: ALICE.identity,
                fingerprint: ALICE.fingerprint,
                signingPrivateJwk: ALICE.signingPrivateJwk,
                x25519PrivateJwk: ALICE.x25519PrivateJwk,
                mlkem768SecretKey: ALICE.mlkem768SecretKey,
                createdAt: ALICE.createdAt,
            },
            NOW
        )
    );
});

afterEach(() => {
    for (const tab of tabs) {
        act(() => tab.root.unmount());
        tab.container.remove();
    }
    tabs = [];
    setKemProvider(NULL_KEM_PROVIDER);
    Reflect.deleteProperty(globalThis, 'indexedDB');
});

const openBoth = async (
    loaded = 'Compare a safety code',
    api = fakeApi(),
    saveFileInB?: (name: string, contents: string) => void
) => {
    const a = await openTab(api.client);
    const b = await openTab(api.client, saveFileInB);
    tabs = [a, b];
    for (const tab of tabs) {
        await waitFor(tab, () => text(tab).includes(loaded), 'the loaded screen');
    }
    return [a, b] as const;
};

describe('Settings → Release keys in two tabs', () => {
    it('a comparison recorded in a stale tab keeps the keys another tab just made', async () => {
        const [a, b] = await openBoth();
        const made = await replaceKeys(a);
        expect(made).toBeTruthy();

        await compareWithBob(b);
        // Settled once tab B lists the comparison, whatever else it says.
        await waitFor(
            b,
            () =>
                (
                    b.container.querySelector('[data-testid="comparisons"]')?.textContent ?? ''
                ).includes('@bob:test.local'),
            'the comparison in tab B'
        );

        const stored = await indexedDbReleaseKeyStore.load(ACCOUNT);
        // The new key set, with its private keys, is still the current one.
        const current = currentKeySet(stored);
        expect(current?.fingerprint).toBe(made);
        expect(current?.signingPrivateJwk.d).toBeTruthy();
        expect(stored?.keySets.map((set) => set.status).sort()).toEqual(['current', 'superseded']);
        // And tab B's comparison is there too, recorded against the key it
        // used, and tab B says that key was replaced meanwhile.
        expect(text(b)).toContain(COMPARED_WITH_OLD_KEY);
        expect(stored?.comparisons).toEqual([
            {
                accountId: BOB.identity.accountId,
                matrixId: '@bob:test.local',
                fingerprint: BOB.fingerprint,
                ownFingerprint: ALICE.fingerprint,
                comparedAt: NOW.toISOString(),
            },
        ]);
    }, 60_000);

    it('a comparison recorded in a stale tab does not bring back keys another tab removed', async () => {
        const [a, b] = await openBoth();
        await click(a, 'Remove release keys from this device');
        await click(a, 'Remove from this device');
        await waitFor(a, () => text(a).includes('Removed your release keys'), 'the removal');

        await compareWithBob(b);
        await waitFor(
            b,
            () =>
                text(b).includes(CHANGED_ELSEWHERE_NOT_RECORDED) ||
                text(b).includes('Recorded on this device'),
            'tab B to settle'
        );
        expect(await indexedDbReleaseKeyStore.load(ACCOUNT)).toBeNull();
        expect(text(b)).toContain(CHANGED_ELSEWHERE_NOT_RECORDED);
    }, 60_000);

    it('a stale tab does not publish a key another tab replaced before it was published', async () => {
        // N1 of the re-check: this device made a key the server never saw
        // (the daily limit, say), so both tabs offer to publish it.
        const unpublished = await createReleaseKeySet(ACCOUNT, new Date('2026-10-26T11:00:00Z'));
        await indexedDbReleaseKeyStore.update(ACCOUNT, (stored) =>
            withNewCurrentKeySet(stored, ACCOUNT, unpublished, NOW)
        );
        const api = fakeApi();
        const [a, b] = await openBoth("Publish this device's key", api);

        // Tab A replaces it and publishes the newer key.
        await click(a, 'Create and publish new release keys');
        await click(a, 'Create and publish new keys');
        await waitFor(
            a,
            () =>
                ownFingerprint(a) !== unpublished.fingerprint &&
                text(a).includes("Published: Blackout's server has this key for you."),
            'the newer key in tab A',
            20_000
        );
        const made = ownFingerprint(a);
        expect(api.current()?.fingerprint).toBe(made);

        // Tab B still shows the older one and its publish button.
        expect(ownFingerprint(b)).toBe(unpublished.fingerprint);
        await click(b, "Publish this device's key");
        await waitFor(
            b,
            () =>
                text(b).includes(CHANGED_ELSEWHERE_NOT_PUBLISHED) ||
                text(b).includes("Published: Blackout's server now has"),
            'tab B to settle'
        );
        // The server never got the older key, and still has the newer one.
        expect(
            api.published.some(
                (identity) => JSON.stringify(identity) === JSON.stringify(unpublished.identity)
            )
        ).toBe(false);
        expect(api.current()?.fingerprint).toBe(made);
        expect(text(b)).toContain(CHANGED_ELSEWHERE_NOT_PUBLISHED);
        await waitFor(b, () => ownFingerprint(b) === made, 'tab B to show the newer key');
    }, 60_000);

    it('a recovery file saved in a stale tab holds the keys stored now, not that tab’s copy', async () => {
        // N3 of the re-check.
        const saveFile = vi.fn<(name: string, contents: string) => void>();
        const [a, b] = await openBoth(undefined, undefined, saveFile);
        const made = await replaceKeys(a);

        const passphrase = 'a long passphrase for this test';
        await type(b, 'Passphrase', passphrase);
        await type(b, 'Passphrase again', passphrase);
        await click(b, 'Save a recovery file');
        await waitFor(b, () => saveFile.mock.calls.length === 1, 'the saved file', 60_000);

        const contents = await readRecoveryFile(saveFile.mock.calls[0][1], passphrase, {
            accountId: ACCOUNT,
        });
        const inFile = contents.keySets.map((set) => [set.fingerprint, set.status]);
        expect(inFile).toEqual(
            (await indexedDbReleaseKeyStore.load(ACCOUNT))?.keySets.map((set) => [
                set.fingerprint,
                set.status,
            ])
        );
        expect(contents.keySets.find((set) => set.status === 'current')?.fingerprint).toBe(made);
        expect(text(b)).toContain(SAVED_STORED_KEYS);
        await waitFor(b, () => ownFingerprint(b) === made, 'tab B to show the newer key');
    }, 180_000);

    it('a stale tab’s Remove does not delete keys another tab made since', async () => {
        const [a, b] = await openBoth();
        const made = await replaceKeys(a);

        await click(b, 'Remove release keys from this device');
        await click(b, 'Remove from this device');
        await waitFor(
            b,
            () =>
                text(b).includes(CHANGED_ELSEWHERE_NOT_REMOVED) ||
                text(b).includes('Removed your release keys'),
            'tab B to settle'
        );
        expect(currentKeySet(await indexedDbReleaseKeyStore.load(ACCOUNT))?.fingerprint).toBe(made);
        expect(text(b)).toContain(CHANGED_ELSEWHERE_NOT_REMOVED);
        // Tab B now shows what is stored, and a second Remove would act on that.
        await waitFor(b, () => ownFingerprint(b) === made, 'tab B to show the new keys');
    }, 60_000);
});
