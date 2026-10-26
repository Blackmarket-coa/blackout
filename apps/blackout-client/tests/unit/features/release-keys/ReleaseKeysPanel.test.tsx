// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
    createReleaseKeySet,
    formatReleaseFingerprint,
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
    COMPARE_READ_ALL,
    compareHow,
    FOREIGN_KEY_PUBLISH_NOTE,
    foreignKeyWarning,
    INVALID_SERVER_KEY_WARNING,
    lookupMismatch,
    missingKeysWarning,
    PUBLISH_RATE_LIMITED,
    PUBLISH_REUSED,
    PUBLISH_STORAGE_LIMIT,
    RECOVERY_PASSPHRASE_DONT_SAVE,
    RELEASE_KEY_REPLACED_ON_SERVER,
    rolledBackWarning,
    RELEASE_KEYS_BROWSER,
    RELEASE_KEYS_LISTING,
    RELEASE_KEYS_LOST_DEVICE,
    RELEASE_KEYS_LOSS,
    RELEASE_KEYS_PURPOSE,
    RELEASE_KEYS_REPLACE_GUIDANCE,
    RELEASE_KEYS_SERVER,
    RELEASE_KEYS_SIGN_OUT,
    RELEASE_KEYS_UNSUPPORTED,
    ReleaseKeysPanel,
    REVOKE_ALL_SESSIONS,
    REVOKE_ALL_SESSIONS_CONFIRM,
    REVOKE_ALL_SESSIONS_DONE,
} from '../../../../src/app/features/release-keys/ReleaseKeysPanel';
import {
    currentKeySet,
    indexedDbReleaseKeyStore,
    withNewCurrentKeySet,
} from '../../../../src/app/features/release-keys/releaseKeyStore';
import {
    ALICE,
    BOB,
    RECOVERY_FILE_ALICE,
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
    /** Refuse every publish with this status, and then answer /me with `afterRefusal`. */
    refusePublish?: { status: number; afterRefusal?: ReleaseIdentityDirectoryEntry };
}) => {
    const requests: ApiRequest[] = [];
    let mine = options.mine;
    const client: ApiClient = async <T,>(request: ApiRequest): Promise<T> => {
        requests.push(request);
        if (request.method === 'GET' && request.path === '/v1/release-identities/me') {
            return mine as T;
        }
        if (request.method === 'PUT' && request.path === '/v1/release-identities/me') {
            if (options.refusePublish) {
                if (options.refusePublish.afterRefusal) mine = options.refusePublish.afterRefusal;
                throw new BlackoutSdkError(
                    'HTTP_REQUEST_FAILED',
                    `Request failed (${options.refusePublish.status})`,
                    'fatal',
                    options.refusePublish.status
                );
            }
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
        if (request.method === 'POST' && request.path === '/v1/auth/sessions/revoke') {
            return { ok: true, refreshTokensRevoked: 2 } as T;
        }
        if (request.method === 'POST' && request.path === '/v1/release-identities/lookup') {
            const { matrixId } = request.body as { matrixId: string };
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
/** A validly signed key for this account that this device did not make. */
const keyFromElsewhere = () => createReleaseKeySet(ACCOUNT, new Date('2026-10-26T08:00:00Z'));
/** The short form the screen shows a fingerprint in. */
const short = (fingerprint: string) => formatReleaseFingerprint(fingerprint.slice(0, 16));

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
            RELEASE_KEYS_SIGN_OUT,
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
            () => text().includes('Create and publish release keys'),
            'the create button'
        );
        // M5: the screen says, before anything is made, that creating publishes
        // and that the listing stays until the account is deleted.
        expect(text()).toContain(RELEASE_KEYS_LISTING);
        await click('Create and publish release keys');
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
        // M1: read every group, and stop at the first that differs.
        expect(text()).toContain(COMPARE_READ_ALL);
        expect(COMPARE_READ_ALL).toContain('Read all twelve groups');
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
                    ? { ...bobEntry(tampered), matrixId: '@tampered:test.local' }
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

    it('says who could have published a key this device did not make, and offers to publish this device’s', async () => {
        await deviceWithAlice();
        const other = await keyFromElsewhere();
        const { client, requests } = fakeApi({
            mine: entryFor(ACCOUNT, '@alice:test.local', other.identity, other.fingerprint),
        });
        await render({ apiClient: client });
        // H1: not "a different key", but who could have put it there.
        const warning = foreignKeyWarning(short(other.fingerprint));
        await waitFor(() => text().includes(warning), 'the warning');
        expect(warning).toContain(
            "If you didn't, someone with access to your account, or Blackout's server, published it."
        );
        // Publishing this device's key retires that one for good.
        expect(text()).toContain(FOREIGN_KEY_PUBLISH_NOTE);
        expect(FOREIGN_KEY_PUBLISH_NOTE).toContain("it can't be published again afterwards");
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
        expect(text()).toContain(
            missingKeysWarning(formatReleaseFingerprint(ALICE.fingerprint.slice(0, 16)))
        );
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

    it('does not let a fingerprint the server states turn a stranger’s key into this device’s old one', async () => {
        // This device made Alice's vector key, then replaced it.
        const newer = await createReleaseKeySet(ACCOUNT, new Date('2026-10-26T11:00:00Z'));
        await indexedDbReleaseKeyStore.save(
            withNewCurrentKeySet(
                withNewCurrentKeySet(null, ACCOUNT, aliceKeySet, NOW),
                ACCOUNT,
                newer,
                NOW
            )
        );
        // The server serves a key this device never made, labelled with the
        // fingerprint of the device's old key.
        const stranger = await keyFromElsewhere();
        const { client } = fakeApi({
            mine: entryFor(ACCOUNT, '@alice:test.local', stranger.identity, ALICE.fingerprint),
        });
        await render({ apiClient: client });
        // Once this device's keys are on screen, the stranger's key must get
        // the warning, whatever fingerprint the server gave it, and the
        // warning shows the fingerprint this device computed (the re-check).
        await waitFor(
            () => Boolean(container.querySelector('[data-testid="own-fingerprint"]')),
            "this device's keys"
        );
        await waitFor(
            () => text().includes(foreignKeyWarning(short(stranger.fingerprint))),
            'the warning'
        );
        expect(text()).not.toContain(short(ALICE.fingerprint));
        expect(text()).not.toContain('still has the key this device used before');
    }, 60_000);

    it('says the server itself put there a key of yours that fails its check', async () => {
        await deviceWithAlice();
        const other = await keyFromElsewhere();
        // Signed for another account, so its check fails for this one.
        const broken = { ...other.identity, signature: BOB.identity.signature };
        const { client } = fakeApi({
            mine: entryFor(ACCOUNT, '@alice:test.local', broken, other.fingerprint),
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes(INVALID_SERVER_KEY_WARNING), 'the warning');
        expect(text()).not.toContain(short(other.fingerprint));
        expect(text()).not.toContain('If you made it on another device');
    }, 60_000);

    it('says when the server has put back a key this device replaced', async () => {
        const newer = await createReleaseKeySet(ACCOUNT, new Date('2026-10-26T11:00:00Z'));
        await indexedDbReleaseKeyStore.save(
            withNewCurrentKeySet(
                withNewCurrentKeySet(null, ACCOUNT, aliceKeySet, NOW),
                ACCOUNT,
                newer,
                NOW
            )
        );
        // Alice's old key current again, the device's newer one listed as replaced.
        const { client } = fakeApi({
            mine: {
                ...entryFor(ACCOUNT, '@alice:test.local', ALICE.identity, ALICE.fingerprint),
                superseded: [
                    {
                        identity: newer.identity,
                        fingerprint: newer.fingerprint,
                        publishedAt: '2026-10-26T11:05:00.000Z',
                        supersededAt: '2026-10-26T11:10:00.000Z',
                    },
                ],
            },
        });
        await render({ apiClient: client });
        await waitFor(
            () => text().includes(rolledBackWarning(short(ALICE.fingerprint))),
            'the rollback warning'
        );
        // N1 of the re-check: the API refuses only identities it has seen, so
        // a key replaced here before it was published can still be published
        // later, from another tab or device, or by someone with the account.
        const warning = rolledBackWarning(short(ALICE.fingerprint));
        expect(warning).toContain('another tab or device of yours');
        expect(warning).toContain('someone with access to your account');
        expect(warning).toContain("Blackout's server put it back");
        expect(warning).not.toMatch(/refuses to do that|for any account|done on the server itself/);
        expect(text()).toContain(RELEASE_KEY_REPLACED_ON_SERVER);
        expect(text()).not.toContain('still has the key this device used before');
    }, 60_000);

    it('does not offer to publish a key the server lists as replaced', async () => {
        await deviceWithAlice();
        const other = await keyFromElsewhere();
        const { client } = fakeApi({
            mine: {
                ...entryFor(ACCOUNT, '@alice:test.local', other.identity, other.fingerprint),
                superseded: [
                    {
                        identity: ALICE.identity,
                        fingerprint: ALICE.fingerprint,
                        publishedAt: '2026-10-26T10:05:00.000Z',
                        supersededAt: '2026-10-26T11:05:00.000Z',
                    },
                ],
            },
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes(RELEASE_KEY_REPLACED_ON_SERVER), 'the replaced note');
        expect(text()).toContain("someone with access to your account, or Blackout's server");
        expect(
            Array.from(container.querySelectorAll('button')).some(
                (candidate) => candidate.textContent?.trim() === "Publish this device's key"
            )
        ).toBe(false);
        expect(text()).toContain('Create and publish new release keys');
    });

    it('says what else to do when replacing keys, before and after', async () => {
        await deviceWithAlice();
        const { client } = fakeApi({ mine: aliceMine(true) });
        await render({ apiClient: client });
        await waitFor(
            () => text().includes('Create and publish new release keys'),
            'the replace button'
        );
        await click('Create and publish new release keys');
        expect(text()).toContain(RELEASE_KEYS_REPLACE_GUIDANCE);
        // N2 of the re-check: new keys sign nothing out, so the lost device's
        // sessions are ended first, as the section below says.
        expect(RELEASE_KEYS_REPLACE_GUIDANCE).toContain("new keys don't sign that device out");
        expect(RELEASE_KEYS_REPLACE_GUIDANCE).toContain(
            'first do what “If a device is lost” below says'
        );
        expect(RELEASE_KEYS_REPLACE_GUIDANCE).toContain('not over Blackout, that your key changed');
        // The section it points to is there, below, with the sign-out button.
        const headings = Array.from(container.querySelectorAll('h3'), (h) => h.textContent);
        expect(headings.indexOf('If a device is lost')).toBeGreaterThan(
            headings.indexOf('Your keys on this device')
        );
        expect(headings.indexOf('Your keys on this device')).toBeGreaterThanOrEqual(0);
        expect(button(REVOKE_ALL_SESSIONS)).toBeTruthy();
        await click('Create and publish new keys');
        await waitFor(
            () => Boolean(container.querySelector('[data-testid="replace-guidance"]')),
            'the guidance after replacing',
            20_000
        );
        expect(container.querySelector('[data-testid="replace-guidance"]')?.textContent).toBe(
            RELEASE_KEYS_REPLACE_GUIDANCE
        );
    }, 60_000);

    it.each([
        ['429, the daily limit', 429, false, PUBLISH_RATE_LIMITED],
        ['409 for a key the server lists as replaced', 409, true, PUBLISH_REUSED],
        ['409 for the storage bound', 409, false, PUBLISH_STORAGE_LIMIT],
    ])('says why a publish was refused: %s', async (_case, status, listed, message) => {
        await deviceWithAlice();
        const other = await keyFromElsewhere();
        const serverEntry = entryFor(
            ACCOUNT,
            '@alice:test.local',
            other.identity,
            other.fingerprint
        );
        const { client } = fakeApi({
            mine: serverEntry,
            refusePublish: {
                status,
                afterRefusal: listed
                    ? {
                          ...serverEntry,
                          superseded: [
                              {
                                  identity: ALICE.identity,
                                  fingerprint: ALICE.fingerprint,
                                  publishedAt: '2026-10-26T10:05:00.000Z',
                                  supersededAt: '2026-10-26T11:05:00.000Z',
                              },
                          ],
                      }
                    : undefined,
            },
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes("Publish this device's key"), 'the publish button');
        await click("Publish this device's key");
        await waitFor(() => text().includes(message), 'the refusal');
    });

    it('refuses a lookup answer for another Matrix id than the one typed', async () => {
        await deviceWithAlice();
        const { client } = fakeApi({
            mine: aliceMine(true),
            // A server answering @bobby with @bob's entry.
            lookup: (matrixId) => (matrixId === '@bobby:test.local' ? bobEntry() : null),
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes('Compare a safety code'), 'the compare section');
        await type('Their Matrix id', '@bobby:test.local');
        await click('Show the code');
        await waitFor(
            () => text().includes(lookupMismatch('@bobby:test.local', '@bob:test.local')),
            'the refusal'
        );
        expect(container.querySelector('[data-testid="safety-code"]')).toBeNull();
        expect((await indexedDbReleaseKeyStore.load(ACCOUNT))?.comparisons).toEqual([]);
    });

    it('does not ask the browser to save a recovery passphrase', async () => {
        await deviceWithAlice();
        const { client } = fakeApi({ mine: aliceMine(true) });
        await render({ apiClient: client });
        await waitFor(() => text().includes('Save a recovery file'), 'the save button');
        const fields = Array.from(container.querySelectorAll('input[type="password"]'));
        expect(fields).toHaveLength(3);
        for (const field of fields) expect(field.getAttribute('autocomplete')).toBe('off');
        // L4: browsers may offer to save it anyway, so the screen says to refuse.
        expect(text()).toContain(RECOVERY_PASSPHRASE_DONT_SAVE);
    });

    it('signs out every Blackout session only once confirmed, and says what that ends', async () => {
        await deviceWithAlice();
        const { client, requests } = fakeApi({ mine: aliceMine(true) });
        await render({ apiClient: client });
        await waitFor(() => text().includes(REVOKE_ALL_SESSIONS), 'the button');
        for (const line of RELEASE_KEYS_LOST_DEVICE) expect(text()).toContain(line);
        const revokes = () =>
            requests.filter((request) => request.path === '/v1/auth/sessions/revoke');

        await click(REVOKE_ALL_SESSIONS);
        expect(text()).toContain(REVOKE_ALL_SESSIONS_CONFIRM);
        // N2 of the re-check: the route ends the caller's own API session
        // too, and no Matrix session, and a device still signed in to Matrix
        // gets a new Blackout session by itself.
        expect(REVOKE_ALL_SESSIONS_CONFIRM).toContain('on every device, this one included');
        expect(REVOKE_ALL_SESSIONS_CONFIRM).toContain('It ends no Matrix session');
        expect(REVOKE_ALL_SESSIONS_CONFIRM).toContain('sign the lost device out of Matrix first');
        expect(revokes()).toHaveLength(0);
        await click('Cancel');
        expect(revokes()).toHaveLength(0);

        await click(REVOKE_ALL_SESSIONS);
        await click('Sign them all out');
        await waitFor(() => text().includes(REVOKE_ALL_SESSIONS_DONE), 'the note');
        expect(revokes()).toEqual([{ method: 'POST', path: '/v1/auth/sessions/revoke', body: {} }]);
    });

    // M4 (independent review, 2026-10-26): an older recovery file does not
    // quietly replace this device's newer key.
    const chooseVectorFile = async () => {
        const file = new File([RECOVERY_FILE_ALICE.fileText], RECOVERY_FILE_NAME, {
            type: 'application/json',
        });
        if (typeof file.text !== 'function') {
            Object.defineProperty(file, 'text', {
                value: async () => RECOVERY_FILE_ALICE.fileText,
            });
        }
        const input = inputLabelled('Recovery file');
        await act(async () => {
            Object.defineProperty(input, 'files', { configurable: true, value: [file] });
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await type('Its passphrase', RECOVERY_FILE_ALICE.passphrase);
        await waitFor(() => !button('Load the recovery file').disabled, 'the file to be read');
        await click('Load the recovery file');
    };

    /** A key set made on this device an hour before the vector file's, and published. */
    const olderDevice = async () => {
        const older = await createReleaseKeySet(ACCOUNT, new Date('2026-10-26T09:00:00Z'));
        await indexedDbReleaseKeyStore.save(withNewCurrentKeySet(null, ACCOUNT, older, NOW));
        return older;
    };

    it('asks before a newer file’s key that the server does not list becomes current', async () => {
        // M4 of the re-check: the file's key is neither the server's current
        // key nor one this device holds; only its unsigned createdAt is later.
        const older = await olderDevice();
        const { client } = fakeApi({
            mine: entryFor(ACCOUNT, '@alice:test.local', older.identity, older.fingerprint),
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes('Load the recovery file'), 'the load section');
        await chooseVectorFile();
        await waitFor(
            () => text().includes("Keep using this device's key?"),
            'the question',
            60_000
        );
        expect(text()).toContain(
            "isn't one this device holds, and Blackout's server doesn't list it"
        );
        expect(text()).toContain('which nothing signs');
        expect(currentKeySet(await indexedDbReleaseKeyStore.load(ACCOUNT))?.fingerprint).toBe(
            older.fingerprint
        );
    }, 180_000);

    it('takes a newer file’s key that is the server’s, judging the server’s list by identity', async () => {
        // The server's replaced list states the file key's fingerprint for
        // another identity: by identity, the file's key was never replaced.
        const older = await olderDevice();
        const { client } = fakeApi({
            mine: {
                ...entryFor(ACCOUNT, '@alice:test.local', ALICE.identity, ALICE.fingerprint),
                superseded: [
                    {
                        identity: older.identity,
                        fingerprint: ALICE.fingerprint,
                        publishedAt: '2026-10-26T09:05:00.000Z',
                        supersededAt: '2026-10-26T10:05:00.000Z',
                    },
                ],
            },
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes('Load the recovery file'), 'the load section');
        await chooseVectorFile();
        await waitFor(
            () => text().includes('Loaded your release keys from the recovery file.'),
            'the loaded keys',
            60_000
        );
        expect(text()).not.toContain("Keep using this device's key?");
        const stored = await indexedDbReleaseKeyStore.load(ACCOUNT);
        expect(currentKeySet(stored)?.fingerprint).toBe(ALICE.fingerprint);
        expect(text()).toContain("Published: Blackout's server has this key for you.");
    }, 180_000);

    /** A key set made on this device an hour after the vector file's. */
    const newerDevice = async () => {
        const newer = await createReleaseKeySet(ACCOUNT, new Date('2026-10-26T11:00:00Z'));
        await indexedDbReleaseKeyStore.save(withNewCurrentKeySet(null, ACCOUNT, newer, NOW));
        return newer;
    };

    it('asks before an older recovery file’s key replaces this device’s, and keeps this device’s', async () => {
        const newer = await newerDevice();
        const { client } = fakeApi({
            mine: entryFor(ACCOUNT, '@alice:test.local', newer.identity, newer.fingerprint),
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes('Load the recovery file'), 'the load section');
        await chooseVectorFile();
        await waitFor(
            () => text().includes("Keep using this device's key?"),
            'the question',
            60_000
        );
        expect(text()).toContain('is older than the one this device uses');
        // Nothing changed while the question is open.
        expect(currentKeySet(await indexedDbReleaseKeyStore.load(ACCOUNT))?.fingerprint).toBe(
            newer.fingerprint
        );
        await click("Keep this device's key");
        await waitFor(
            () => text().includes("This device's key stays your current key"),
            'the note'
        );
        const stored = await indexedDbReleaseKeyStore.load(ACCOUNT);
        expect(currentKeySet(stored)?.fingerprint).toBe(newer.fingerprint);
        expect(stored?.keySets.map((set) => [set.fingerprint, set.status])).toEqual([
            [newer.fingerprint, 'current'],
            [ALICE.fingerprint, 'superseded'],
        ]);
        expect(stored?.comparisons).toEqual(RECOVERY_FILE_ALICE.contents.comparisons);
        expect(text()).toContain("Published: Blackout's server has this key for you.");
    }, 180_000);

    it('uses the file’s key only when told to', async () => {
        const newer = await newerDevice();
        const { client } = fakeApi({
            mine: entryFor(ACCOUNT, '@alice:test.local', newer.identity, newer.fingerprint),
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes('Load the recovery file'), 'the load section');
        await chooseVectorFile();
        await waitFor(
            () => text().includes("Keep using this device's key?"),
            'the question',
            60_000
        );
        await click("Use the file's key");
        await waitFor(() => text().includes("The file's key is now this device's"), 'the note');
        const stored = await indexedDbReleaseKeyStore.load(ACCOUNT);
        expect(currentKeySet(stored)?.fingerprint).toBe(ALICE.fingerprint);
        expect(stored?.keySets.map((set) => [set.fingerprint, set.status])).toEqual([
            [newer.fingerprint, 'superseded'],
            [ALICE.fingerprint, 'current'],
        ]);
    }, 180_000);

    it('says when the file’s key is one the server lists as replaced', async () => {
        const newer = await newerDevice();
        const { client } = fakeApi({
            mine: {
                ...entryFor(ACCOUNT, '@alice:test.local', newer.identity, newer.fingerprint),
                superseded: [
                    {
                        identity: ALICE.identity,
                        fingerprint: ALICE.fingerprint,
                        publishedAt: '2026-10-26T10:05:00.000Z',
                        supersededAt: '2026-10-26T11:05:00.000Z',
                    },
                ],
            },
        });
        await render({ apiClient: client });
        await waitFor(() => text().includes('Load the recovery file'), 'the load section');
        await chooseVectorFile();
        await waitFor(
            () => text().includes("Keep using this device's key?"),
            'the question',
            60_000
        );
        expect(text()).toContain("Blackout's server lists it as replaced");
        await click("Don't load the file");
        expect(currentKeySet(await indexedDbReleaseKeyStore.load(ACCOUNT))?.fingerprint).toBe(
            newer.fingerprint
        );
        expect((await indexedDbReleaseKeyStore.load(ACCOUNT))?.keySets).toHaveLength(1);
    }, 180_000);
});
