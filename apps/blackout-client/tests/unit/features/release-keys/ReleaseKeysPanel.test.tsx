// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
    mlKem768Provider,
    NULL_KEM_PROVIDER,
    parseRecoveryFile,
    RECOVERY_FILE_NAME,
    setKemProvider,
    verifyReleaseIdentity,
    type ReleaseIdentity,
    type ReleaseIdentityDirectoryEntry,
} from '@blackout/protocol';
import { BlackoutSdkError, type ApiClient, type ApiRequest } from '@blackout/sdk';
import {
    COMPARE_MEANING,
    compareHow,
    RELEASE_KEYS_BROWSER,
    RELEASE_KEYS_LOSS,
    RELEASE_KEYS_PURPOSE,
    RELEASE_KEYS_SERVER,
    RELEASE_KEYS_UNSUPPORTED,
    ReleaseKeysPanel,
} from '../../../../src/app/features/release-keys/ReleaseKeysPanel';
import {
    currentKeySet,
    indexedDbReleaseKeyStore,
    withNewCurrentKeySet,
} from '../../../../src/app/features/release-keys/releaseKeyStore';
import {
    ALICE,
    BOB,
    SAFETY_CODE_ALICE_BOB,
} from '../../../../../../packages/blackout-protocol/src/release/testVectors';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT = ALICE.identity.accountId;
const NOW = new Date('2026-10-26T12:00:00Z');

const entryFor = (
    accountId: string,
    matrixId: string,
    identity: ReleaseIdentity | null,
    fingerprint = ''
): ReleaseIdentityDirectoryEntry => ({
    accountId,
    matrixId,
    current: identity ? { identity, fingerprint, publishedAt: NOW.toISOString() } : null,
    superseded: [],
});

const notFound = () =>
    new BlackoutSdkError('HTTP_REQUEST_FAILED', 'Request failed (404)', 'fatal', 404);

/** A stand-in for the API: the caller's entry, publishing, and lookups. */
const fakeApi = (options: {
    mine: ReleaseIdentityDirectoryEntry;
    lookup?: (matrixId: string) => ReleaseIdentityDirectoryEntry | null;
}) => {
    const requests: ApiRequest[] = [];
    let mine = options.mine;
    const client: ApiClient = async <T,>(request: ApiRequest): Promise<T> => {
        requests.push(request);
        if (request.method === 'GET' && request.path === '/v1/release-identities/me') {
            return mine as T;
        }
        if (request.method === 'PUT' && request.path === '/v1/release-identities/me') {
            const { identity } = request.body as { identity: ReleaseIdentity };
            const check = await verifyReleaseIdentity(identity, { accountId: mine.accountId });
            if (!check.ok)
                throw new BlackoutSdkError(
                    'HTTP_REQUEST_FAILED',
                    'Request failed (400)',
                    'fatal',
                    400
                );
            mine = entryFor(mine.accountId, mine.matrixId ?? '', identity, check.fingerprint);
            return { ...mine, changed: true } as T;
        }
        if (request.method === 'GET' && request.path.startsWith('/v1/release-identities/lookup?')) {
            const matrixId = new URLSearchParams(request.path.split('?')[1]).get('matrixId') ?? '';
            const found = options.lookup?.(matrixId) ?? null;
            if (!found) throw notFound();
            return found as T;
        }
        throw new Error(`unexpected request ${request.method} ${request.path}`);
    };
    return { client, requests };
};

const aliceMine = (published: boolean) =>
    entryFor(ACCOUNT, '@alice:test.local', published ? ALICE.identity : null, ALICE.fingerprint);
const bobEntry = (identity: ReleaseIdentity = BOB.identity) =>
    entryFor(BOB.identity.accountId, '@bob:test.local', identity, BOB.fingerprint);

const aliceKeySet = {
    identity: ALICE.identity,
    fingerprint: ALICE.fingerprint,
    signingPrivateJwk: ALICE.signingPrivateJwk,
    x25519PrivateJwk: ALICE.x25519PrivateJwk,
    mlkem768SecretKey: ALICE.mlkem768SecretKey,
    createdAt: ALICE.createdAt,
};
const deviceWithAlice = () =>
    indexedDbReleaseKeyStore.save(withNewCurrentKeySet(null, ACCOUNT, aliceKeySet, NOW));

let container: HTMLDivElement;
let root: ReactDOM.Root;

const render = async (
    props: Partial<React.ComponentProps<typeof ReleaseKeysPanel>> & { apiClient: ApiClient }
) => {
    await act(async () => {
        root.render(
            <ReleaseKeysPanel
                checkSupport={async () => true}
                saveFile={() => undefined}
                now={() => NOW}
                {...props}
            />
        );
    });
};

const text = () => container.textContent ?? '';

// Under Vitest's 5 s test timeout, so a wait that fails fails its own test.
const waitFor = async (check: () => boolean, what: string, timeoutMs = 4_000) => {
    const started = Date.now();
    while (!check()) {
        if (Date.now() - started > timeoutMs) {
            throw new Error(`timed out waiting for ${what}; screen says: ${text().slice(0, 600)}`);
        }
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25));
        });
    }
};

const button = (label: string): HTMLButtonElement => {
    const found = Array.from(container.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === label
    );
    if (!found) throw new Error(`no button "${label}"; screen says: ${text().slice(0, 600)}`);
    return found;
};

const click = async (label: string) => {
    await act(async () => {
        button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
};

const inputLabelled = (label: string): HTMLInputElement => {
    const found = Array.from(container.querySelectorAll('label')).find((candidate) =>
        candidate.textContent?.trim().startsWith(label)
    );
    const input = found?.querySelector('input');
    if (!input) throw new Error(`no input "${label}"`);
    return input;
};

const type = async (label: string, value: string) => {
    const input = inputLabelled(label);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
};

beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
    setKemProvider(mlKem768Provider);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setKemProvider(NULL_KEM_PROVIDER);
    Reflect.deleteProperty(globalThis, 'indexedDB');
});

describe('Settings → Release keys', () => {
    it('says the device cannot hold keys when WebCrypto lacks what they need', async () => {
        const { client, requests } = fakeApi({ mine: aliceMine(false) });
        await render({ apiClient: client, checkSupport: async () => false });
        await waitFor(() => text().includes(RELEASE_KEYS_UNSUPPORTED), 'the unsupported note');
        expect(text()).toContain(RELEASE_KEYS_PURPOSE);
        expect(container.querySelectorAll('button')).toHaveLength(0);
        expect(requests).toHaveLength(0);
    });

    it('says what the keys are for, that arming is not available, and nothing stronger', async () => {
        const { client } = fakeApi({ mine: aliceMine(false) });
        await render({ apiClient: client });
        await waitFor(() => text().includes('You have no release keys yet.'), 'the empty state');
        for (const sentence of [
            RELEASE_KEYS_PURPOSE,
            RELEASE_KEYS_SERVER,
            RELEASE_KEYS_LOSS,
            RELEASE_KEYS_BROWSER,
        ]) {
            expect(text()).toContain(sentence);
        }
        expect(text()).toContain("you can't arm a new switch");
        expect(text()).toContain('nothing is encrypted for these keys today');
        // §7 of the release design: never promise a release, never advertise
        // the cipher suite, never call anything private that is not.
        expect(text()).not.toMatch(
            /will be released|guarantee|certain to|unstoppable|post-quantum|quantum|end-to-end|anonymous|deniab/i
        );
    });

    it('creates keys on this device and publishes only their public half', async () => {
        const { client, requests } = fakeApi({ mine: aliceMine(false) });
        await render({ apiClient: client });
        await waitFor(
            () => text().includes('Create release keys on this device'),
            'the create button'
        );
        await click('Create release keys on this device');
        await waitFor(
            () => text().includes("Published: Blackout's server has this key for you."),
            'publication'
        );

        const puts = requests.filter((request) => request.method === 'PUT');
        expect(puts).toHaveLength(1);
        const sent = puts[0].body as { identity: ReleaseIdentity };
        expect(Object.keys(sent).sort()).toEqual(['identity']);
        expect(Object.keys(sent.identity).sort()).toEqual(
            ['accountId', 'mlkem768Key', 'signature', 'signingKey', 'v', 'x25519Key'].sort()
        );

        const stored = await indexedDbReleaseKeyStore.load(ACCOUNT);
        const keySet = currentKeySet(stored);
        expect(keySet?.identity).toEqual(sent.identity);
        const wire = JSON.stringify(requests);
        expect(wire).not.toContain(keySet!.signingPrivateJwk.d);
        expect(wire).not.toContain(keySet!.x25519PrivateJwk.d);
        expect(wire).not.toContain(keySet!.mlkem768SecretKey.slice(0, 40));
        expect(
            container
                .querySelector('[data-testid="own-fingerprint"]')
                ?.textContent?.replace(/ /g, '')
        ).toBe(keySet!.fingerprint);
    });

    it('compares a code with someone by Matrix id, and records it when they match', async () => {
        await deviceWithAlice();
        const { client } = fakeApi({
            mine: aliceMine(true),
            // The fingerprint the server states is wrong: the screen must compute its own.
            lookup: (matrixId) =>
                matrixId === '@bob:test.local'
                    ? {
                          ...bobEntry(),
                          current: { ...bobEntry().current!, fingerprint: 'f'.repeat(64) },
                      }
                    : null,
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes('Compare a safety code'), 'the compare section');
        await type('Their Matrix id', '@bob:test.local');
        await click('Show the code');
        await waitFor(
            () => Boolean(container.querySelector('[data-testid="safety-code"]')),
            'the code'
        );

        const groups = Array.from(
            container.querySelectorAll('[aria-label="Safety code"] span'),
            (span) => span.textContent
        );
        expect(groups).toEqual(SAFETY_CODE_ALICE_BOB.groups);
        expect(text()).toContain(compareHow('@bob:test.local'));
        expect(text()).toContain(COMPARE_MEANING);

        await click('The codes match');
        await waitFor(() => text().includes('Recorded on this device'), 'the recorded note');
        const stored = await indexedDbReleaseKeyStore.load(ACCOUNT);
        expect(stored?.comparisons).toEqual([
            {
                accountId: BOB.identity.accountId,
                matrixId: '@bob:test.local',
                fingerprint: BOB.fingerprint,
                ownFingerprint: ALICE.fingerprint,
                comparedAt: NOW.toISOString(),
            },
        ]);
        expect(container.querySelector('[data-testid="comparisons"]')?.textContent).toContain(
            '@bob:test.local'
        );
    });

    it('records nothing when the codes do not match', async () => {
        await deviceWithAlice();
        const { client } = fakeApi({ mine: aliceMine(true), lookup: () => bobEntry() });
        await render({ apiClient: client });
        await waitFor(() => text().includes('Compare a safety code'), 'the compare section');
        await type('Their Matrix id', '@bob:test.local');
        await click('Show the code');
        await waitFor(
            () => Boolean(container.querySelector('[data-testid="safety-code"]')),
            'the code'
        );
        await click("They don't match");
        await waitFor(() => text().includes('Nothing was recorded.'), 'the not-recorded note');
        expect((await indexedDbReleaseKeyStore.load(ACCOUNT))?.comparisons).toEqual([]);
    });

    it('shows no code for keys that fail their check, for nobody, or for oneself', async () => {
        await deviceWithAlice();
        const tampered = { ...BOB.identity, signature: ALICE.identity.signature };
        const { client } = fakeApi({
            mine: aliceMine(true),
            lookup: (matrixId) =>
                matrixId === '@tampered:test.local'
                    ? bobEntry(tampered)
                    : matrixId === '@alice:test.local'
                    ? aliceMine(true)
                    : null,
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes('Compare a safety code'), 'the compare section');

        await type('Their Matrix id', '@tampered:test.local');
        await click('Show the code');
        await waitFor(() => text().includes('failed their check'), 'the failed check');
        expect(container.querySelector('[data-testid="safety-code"]')).toBeNull();

        await type('Their Matrix id', '@bob:elsewhere.example');
        await click('Show the code');
        await waitFor(() => text().includes('Nobody on this server with that Matrix id'), 'nobody');

        await type('Their Matrix id', '@alice:test.local');
        await click('Show the code');
        await waitFor(() => text().includes("That's you."), 'self');
        expect(container.querySelector('[data-testid="safety-code"]')).toBeNull();
    });

    it('says when the server has another key for you, and offers to publish this device’s', async () => {
        await deviceWithAlice();
        const other = { ...BOB.identity, accountId: ACCOUNT };
        const { client, requests } = fakeApi({
            mine: entryFor(ACCOUNT, '@alice:test.local', other, BOB.fingerprint),
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes('has a different release key for you'), 'the mismatch');
        expect(text()).toContain('Publish your key first');
        await click("Publish this device's key");
        await waitFor(
            () => text().includes("Published: Blackout's server has this key for you."),
            'publication'
        );
        const put = requests.find((request) => request.method === 'PUT');
        expect((put?.body as { identity: ReleaseIdentity }).identity).toEqual(ALICE.identity);
    });

    it('asks before removing the keys from this device, then removes them', async () => {
        await deviceWithAlice();
        const { client } = fakeApi({ mine: aliceMine(true) });
        await render({ apiClient: client });
        await waitFor(
            () => text().includes('Remove release keys from this device'),
            'the remove button'
        );
        await click('Remove release keys from this device');
        expect(text()).toContain('Without a recovery file, they can');
        expect(await indexedDbReleaseKeyStore.load(ACCOUNT)).not.toBeNull();
        await click('Remove from this device');
        await waitFor(
            () => text().includes('Removed your release keys from this device.'),
            'removal'
        );
        expect(await indexedDbReleaseKeyStore.load(ACCOUNT)).toBeNull();
        expect(text()).toContain("aren't on this device");
    });

    it('refuses passphrases that differ or are short, before encrypting anything', async () => {
        await deviceWithAlice();
        const saveFile = vi.fn();
        const { client } = fakeApi({ mine: aliceMine(true) });
        await render({ apiClient: client, saveFile });
        await waitFor(() => text().includes('Save a recovery file'), 'the save button');
        await type('Passphrase again', 'one passphrase here');
        await type('Passphrase', 'another passphrase');
        await click('Save a recovery file');
        expect(text()).toContain("The two passphrases don't match.");
        await type('Passphrase', 'short');
        await type('Passphrase again', 'short');
        await click('Save a recovery file');
        expect(text()).toContain('at least 12 characters');
        expect(saveFile).not.toHaveBeenCalled();
    });

    it('saves a recovery file and loads it back on a device without the keys', async () => {
        await deviceWithAlice();
        const saveFile = vi.fn();
        const { client } = fakeApi({ mine: aliceMine(true) });
        await render({ apiClient: client, saveFile });
        await waitFor(() => text().includes('Save a recovery file'), 'the save button');
        const passphrase = 'a long passphrase for this test';
        await type('Passphrase', passphrase);
        await type('Passphrase again', passphrase);
        await click('Save a recovery file');
        await waitFor(() => saveFile.mock.calls.length === 1, 'the saved file', 60_000);
        const [name, fileText] = saveFile.mock.calls[0] as [string, string];
        expect(name).toBe(RECOVERY_FILE_NAME);
        expect(() => parseRecoveryFile(fileText)).not.toThrow();
        expect(fileText).not.toContain(ALICE.signingPrivateJwk.d);
        expect(text()).toContain('Check that it was saved');

        // A device that has lost its keys.
        await indexedDbReleaseKeyStore.remove(ACCOUNT);
        act(() => root.unmount());
        root = ReactDOM.createRoot(container);
        await render({ apiClient: client });
        await waitFor(() => text().includes("aren't on this device"), 'the missing keys');

        const file = new File([fileText], RECOVERY_FILE_NAME, { type: 'application/json' });
        if (typeof file.text !== 'function') {
            Object.defineProperty(file, 'text', { value: async () => fileText });
        }
        const input = inputLabelled('Recovery file');
        await act(async () => {
            Object.defineProperty(input, 'files', { configurable: true, value: [file] });
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await type('Its passphrase', passphrase);
        await waitFor(() => !button('Load the recovery file').disabled, 'the file to be read');
        await click('Load the recovery file');
        await waitFor(() => text().includes('Loaded your release keys'), 'the loaded keys', 60_000);
        const stored = await indexedDbReleaseKeyStore.load(ACCOUNT);
        expect(currentKeySet(stored)?.fingerprint).toBe(ALICE.fingerprint);
        expect(text()).toContain("Published: Blackout's server has this key for you.");
    }, 180_000);
});
