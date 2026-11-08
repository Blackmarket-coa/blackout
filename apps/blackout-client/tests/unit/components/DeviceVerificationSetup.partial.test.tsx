// @vitest-environment jsdom
//
// A from-scratch setup that fails partway can be finished from the same form
// (S9, `docs/security/key-backup-nudge-2026-11-02.md`, fifth review). Real
// `MatrixClient`, real Rust crypto in memory, `createFakeKeyHomeserver`.
//
// The account starts with neither a backup nor cross-signing. The first
// Continue uploads cross-signing and then fails at a later step (the backup's
// creation answers 500 once), so the account now has a master key: the form's
// own. Before the fix the form's own check then refused the second Continue
// with "Your account already has cross-signing set up…", and the only way on
// was the warned reset. Now the form remembers the master key its attempt
// made; the check lets it go on when the homeserver holds exactly that key and
// no backup, and the form keeps that identity (no second upload, no password,
// no identity change for contacts) and creates the backup. Anything another
// device changed in between (a backup, another master key) is still refused.
//
// Sixth review: from its first write on, an attempt that stops (fails, or its
// account confirmation is cancelled) leaves the account's secret storage
// opening only with that attempt's recovery key. The form now keeps that key
// on screen, says how far the attempt got, uses the same key on the next
// Continue, and offers no Continue where the next attempt could not finish (a
// backup this attempt may have created). Before, the key was never shown and,
// after a cancel, the error line was empty.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Folds overlays wrap their content in focus-trap-react, which in jsdom finds
// no tabbable node (no layout) and throws. The existing overlay tests render it
// as a pass-through for the same reason.
vi.mock('focus-trap-react', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import type { MatrixClient } from 'matrix-js-sdk';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api';
import type { SecretStorageKeyDescription } from 'matrix-js-sdk/lib/secret-storage';
import {
    DeviceVerificationReset,
    DeviceVerificationSetup,
} from '../../../src/app/components/DeviceVerificationSetup';
import {
    SETUP_CONFIRM_CANCELLED_TEXT,
    SETUP_PARTWAY_TEXT,
    SETUP_REFUSED_TEXT,
} from '../../../src/client/keyBackupCheck';
import {
    ME,
    OLD_MASTER_KEY,
    createFakeKeyClient,
    createFakeKeyHomeserver,
    type FakeAnswer,
    type FakeKeyHomeserver,
} from '../helpers/fakeKeyHomeserver';
import {
    bodyText,
    buttonsNamed,
    click,
    renderWithClient,
    settle,
    submitForm,
    waitFor,
} from '../helpers/keyBackupRender';
import type { MountedDialog } from '../helpers/modalReliability';

const RECOVERY_KEY_SCREEN = 'Store the Recovery Key in a safe place';
const SERVER_ERROR: FakeAnswer = {
    kind: 'json',
    status: 500,
    body: { errcode: 'M_UNKNOWN', error: 'Internal server error' },
};
/** A 4xx: the SDK's request queue retries a 5xx on `/keys/signatures/upload`, not this. */
const REJECTED_SIGNATURE: FakeAnswer = {
    kind: 'json',
    status: 400,
    body: { errcode: 'M_INVALID_SIGNATURE', error: 'Invalid signature' },
};

let mounted: MountedDialog | undefined;
let mx: MatrixClient | undefined;

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(async () => {
    mounted?.unmount();
    mounted = undefined;
    if (mx) {
        // A finished setup starts the SDK's backup check without awaiting it;
        // let it finish before the Rust machine closes (see
        // DeviceVerificationSetup.deletesBackup.test.tsx).
        await mx.getCrypto()?.checkKeyBackupAndEnable();
        await settle(20);
        mx.stopClient();
    }
    mx = undefined;
});

const submit = async () => {
    const form = document.body.querySelector('form');
    expect(form).not.toBeNull();
    await submitForm(form as HTMLFormElement);
};

const signingUploads = (hs: FakeKeyHomeserver): number =>
    hs.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/keys/device_signing/upload'))
        .length;

/** Shows the recovery key on screen (its "Show" chip) and reads it. */
const shownRecoveryKey = async (): Promise<string> => {
    const [show] = buttonsNamed('Show');
    expect(show).toBeDefined();
    await click(show);
    const keyText = document.body.querySelector('[style*="monospace"]')?.textContent ?? '';
    expect(keyText).not.toMatch(/\*/);
    return keyText;
};

/** The account's default secret-storage key as the homeserver holds it. */
const defaultKeyId = (hs: FakeKeyHomeserver): string | undefined =>
    (hs.accountData.get('m.secret_storage.default_key') as { key?: string } | undefined)?.key;

/** Whether `recoveryKey` opens the account's default secret-storage key. */
const opensDefaultSecretStorage = async (
    hs: FakeKeyHomeserver,
    recoveryKey: string
): Promise<boolean> => {
    const keyId = defaultKeyId(hs);
    if (!keyId || !mx) return false;
    const info = hs.accountData.get(`m.secret_storage.key.${keyId}`) as
        | SecretStorageKeyDescription
        | undefined;
    if (!info) return false;
    return mx.secretStorage.checkKey(decodeRecoveryKey(recoveryKey), info);
};

/** Fills the account-password stage and submits it. */
const enterPassword = async () => {
    const pw = document.body.querySelector('input[name="passwordInput"]') as HTMLInputElement;
    pw.value = 'correct horse battery staple';
    const pwForm = pw.closest('form') as HTMLFormElement;
    // PasswordStage reads `form.passwordInput`, the form's named-property
    // getter, which browsers provide and jsdom does not.
    Object.defineProperty(pwForm, 'passwordInput', { value: pw, configurable: true });
    await submitForm(pwForm);
};

/** Closes the account-password stage with its ✕ (the first button of its dialog). */
const cancelPassword = async () => {
    const pw = document.body.querySelector('input[name="passwordInput"]') as HTMLInputElement;
    const dialog = (pw.closest('form') as HTMLFormElement).parentElement as HTMLElement;
    await click(dialog.querySelector('button') as HTMLButtonElement);
};

/** Renders the setup for a new account and runs a first Continue that fails after cross-signing. */
const firstAttemptFailsAtTheBackup = async () => {
    const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
    mx = createFakeKeyClient(hs);
    await mx.initRustCrypto({ useIndexedDB: false });
    hs.failNext('POST', '/room_keys/version', SERVER_ERROR);

    mounted = await renderWithClient(mx, <DeviceVerificationSetup onCancel={() => undefined} />);
    await waitFor(() => bodyText().includes('Setup Device Verification'), {
        what: 'the setup dialog',
    });
    await submit();
    await waitFor(() => bodyText().includes(SETUP_PARTWAY_TEXT.backup_none.next as string), {
        what: 'the first attempt to stop partway',
        timeoutMs: 30_000,
    });
    const ownKey = hs.masterKey();
    expect(ownKey).not.toBeNull();
    expect(ownKey).not.toBe(OLD_MASTER_KEY);
    expect(hs.backupVersion()).toBeNull();
    expect(bodyText()).toContain('Internal server error');
    expect(bodyText()).toContain(SETUP_PARTWAY_TEXT.backup_none.what);
    // Not the finished screen, but this attempt's recovery key, which is the
    // only one that opens the account's secret storage now.
    expect(bodyText()).not.toContain(RECOVERY_KEY_SCREEN);
    const partwayKey = await shownRecoveryKey();
    expect(await opensDefaultSecretStorage(hs, partwayKey)).toBe(true);
    // The next Continue uses this key, so no new passphrase is asked.
    expect(document.body.querySelector('input[name="passphraseInput"]')).toBeNull();
    expect(signingUploads(hs)).toBe(1);
    return { hs, ownKey: ownKey as string, partwayKey };
};

describe('SetupVerification: a setup that failed partway', () => {
    it('the next Continue keeps the form’s own cross-signing and creates the backup', async () => {
        const { hs, ownKey, partwayKey } = await firstAttemptFailsAtTheBackup();
        const writesBefore = hs.destructiveCalls().length;

        await submit();
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the recovery key screen',
            timeoutMs: 30_000,
        });

        expect(bodyText()).not.toContain(SETUP_REFUSED_TEXT.crossSigning);
        expect(bodyText()).not.toContain('Account Password');
        // The identity the first attempt made is kept: no second upload.
        expect(hs.masterKey()).toBe(ownKey);
        expect(signingUploads(hs)).toBe(1);
        expect(hs.calls.filter((c) => c.method === 'DELETE')).toEqual([]);
        expect(hs.backupVersion()).toBe('1');

        // The new backup is signed by the kept master key, so this device and
        // any session that trusts the identity trust it.
        const created = hs.calls.filter(
            (c) => c.method === 'POST' && c.path.endsWith('/room_keys/version')
        );
        expect(created).toHaveLength(2);
        const signed = created[1].body as {
            auth_data: { signatures: Record<string, Record<string, string>> };
        };
        expect(Object.keys(signed.auth_data.signatures[ME])).toContain(`ed25519:${ownKey}`);

        // The recovery key shown is the new secret storage's, and the kept
        // cross-signing keys and the backup key are stored under it.
        const defaultKey = (hs.accountData.get('m.secret_storage.default_key') as { key: string })
            .key;
        const storedUnder = (type: string) =>
            Object.keys((hs.accountData.get(type) as { encrypted: object }).encrypted);
        for (const secret of [
            'm.cross_signing.master',
            'm.cross_signing.self_signing',
            'm.cross_signing.user_signing',
            'm.megolm_backup.v1',
        ]) {
            expect(storedUnder(secret), secret).toEqual([defaultKey]);
        }
        expect(hs.destructiveCalls().length).toBeGreaterThan(writesBefore);
        // The key the partway screen showed is the finished one.
        const finalKey = await shownRecoveryKey();
        expect(finalKey).toBe(partwayKey);
        expect(await opensDefaultSecretStorage(hs, finalKey)).toBe(true);
    }, 90_000);

    it('another master key on the server by then: refused, nothing written', async () => {
        const { hs } = await firstAttemptFailsAtTheBackup();
        hs.setMasterKey(true); // another device replaced cross-signing meanwhile
        const writesBefore = hs.destructiveCalls().length;

        await submit();
        await waitFor(() => bodyText().includes(SETUP_REFUSED_TEXT.crossSigning), {
            what: 'the refusal',
            timeoutMs: 30_000,
        });
        expect(hs.destructiveCalls()).toHaveLength(writesBefore);
        expect(hs.masterKey()).toBe(OLD_MASTER_KEY);
        expect(hs.backupVersion()).toBeNull();
        // The refusal wrote nothing, so the earlier attempt's key still opens
        // the secret storage and stays on screen; "Press Continue" is gone.
        expect(bodyText()).not.toContain(SETUP_PARTWAY_TEXT.backup_none.next as string);
        expect(bodyText()).toContain(SETUP_PARTWAY_TEXT.backup_none.what);
        expect(bodyText()).not.toContain(RECOVERY_KEY_SCREEN);
    }, 90_000);

    it('a backup on the server by then: refused, the backup stays', async () => {
        const { hs, ownKey } = await firstAttemptFailsAtTheBackup();
        hs.setBackupVersion('7'); // another app created a backup meanwhile
        const writesBefore = hs.destructiveCalls().length;

        await submit();
        await waitFor(() => bodyText().includes(SETUP_REFUSED_TEXT.backup), {
            what: 'the refusal',
            timeoutMs: 30_000,
        });
        expect(hs.destructiveCalls()).toHaveLength(writesBefore);
        expect(hs.backupVersion()).toBe('7');
        expect(hs.masterKey()).toBe(ownKey);
        expect(bodyText()).not.toContain(RECOVERY_KEY_SCREEN);
        expect(bodyText()).toContain(SETUP_PARTWAY_TEXT.backup_none.what);
    }, 90_000);

    it('a cross-signing step that failed after its keys were uploaded is done again, with the password', async () => {
        // The signing keys reach the homeserver, then this device's signature
        // upload fails: the form's own key is on the server but its
        // cross-signing step did not finish, so the next Continue makes the
        // identity again rather than keep a half-uploaded one. The fake asks
        // for the password because a master key now exists, as Synapse does.
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });
        hs.failNext('POST', '/keys/signatures/upload', REJECTED_SIGNATURE);

        mounted = await renderWithClient(
            mx,
            <DeviceVerificationSetup onCancel={() => undefined} />
        );
        await waitFor(() => bodyText().includes('Setup Device Verification'), {
            what: 'the setup dialog',
        });
        await submit();
        await waitFor(() => bodyText().includes('Invalid signature'), {
            what: 'the first attempt to fail',
            timeoutMs: 30_000,
        });
        const firstKey = hs.masterKey();
        expect(firstKey).not.toBeNull();
        expect(hs.backupVersion()).toBeNull();
        // Its cross-signing step did not finish: the form says so, and shows
        // the key that now opens the secret storage.
        expect(bodyText()).toContain(SETUP_PARTWAY_TEXT.cross_signing.what);
        expect(bodyText()).toContain(SETUP_PARTWAY_TEXT.cross_signing.next as string);
        expect(bodyText()).not.toContain(SETUP_PARTWAY_TEXT.backup_none.what);
        const partwayKey = await shownRecoveryKey();
        expect(await opensDefaultSecretStorage(hs, partwayKey)).toBe(true);

        await submit();
        await waitFor(() => bodyText().includes('Account Password'), {
            what: 'the password stage',
            timeoutMs: 30_000,
        });
        expect(bodyText()).not.toContain(SETUP_REFUSED_TEXT.crossSigning);
        await enterPassword();

        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the recovery key screen',
            timeoutMs: 30_000,
        });
        expect(hs.masterKey()).not.toBe(firstKey);
        expect(hs.backupVersion()).toBe('1');
        expect(hs.calls.filter((c) => c.method === 'DELETE')).toEqual([]);
        const finalKey = await shownRecoveryKey();
        expect(finalKey).toBe(partwayKey);
        expect(await opensDefaultSecretStorage(hs, finalKey)).toBe(true);
    }, 90_000);

    it('the backup was created, then storing its key failed: the key stays on screen, no Continue, no restore claim', async () => {
        // The verifier's case: `POST /room_keys/version` succeeds, then the
        // `PUT` of `m.megolm_backup.v1` into secret storage answers 500.
        // Before the fix the form said "Press Continue to try the rest
        // again", and that Continue was refused with the backup text, whose
        // "may be able to restore from it" isn't true of a backup whose key
        // never reached secret storage; the recovery key was never shown.
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });
        hs.failNext('PUT', '/account_data/m.megolm_backup.v1', SERVER_ERROR);

        mounted = await renderWithClient(
            mx,
            <DeviceVerificationSetup onCancel={() => undefined} />
        );
        await waitFor(() => bodyText().includes('Setup Device Verification'), {
            what: 'the setup dialog',
        });
        await submit();
        await waitFor(() => bodyText().includes(SETUP_PARTWAY_TEXT.backup_unclear.what), {
            what: 'the attempt to stop after creating the backup',
            timeoutMs: 30_000,
        });
        expect(hs.backupVersion()).toBe('1');
        expect(hs.accountData.has('m.megolm_backup.v1')).toBe(false);
        expect(bodyText()).toContain('Internal server error');
        expect(SETUP_PARTWAY_TEXT.backup_unclear.next).toBeUndefined();
        expect(buttonsNamed('Continue')).toEqual([]);
        expect(bodyText()).not.toContain(SETUP_REFUSED_TEXT.backup);
        expect(bodyText()).not.toContain(RECOVERY_KEY_SCREEN);
        const partwayKey = await shownRecoveryKey();
        expect(await opensDefaultSecretStorage(hs, partwayKey)).toBe(true);
        expect(hs.calls.filter((c) => c.method === 'DELETE')).toEqual([]);

        // A submit by other means (the verifier's probe dispatched one) starts
        // nothing either: no request, no refusal.
        const callsBefore = hs.calls.length;
        await submit();
        await settle(50);
        expect(hs.calls).toHaveLength(callsBefore);
        expect(bodyText()).not.toContain(SETUP_REFUSED_TEXT.backup);
    }, 90_000);

    it('the backup step failed and the backup check then failed: no Continue', async () => {
        // The creation answers 500 (no backup made), and every later
        // `GET /room_keys/version` fails: the form cannot know whether a
        // backup exists, so it does not offer the step that would delete one.
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const seen: FakeKeyHomeserver = {
            ...hs,
            fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
                const answer = await hs.fetchFn(input, init);
                const url = typeof input === 'string' || input instanceof URL ? input : input.url;
                if (init?.method === 'POST' && String(url).endsWith('/room_keys/version')) {
                    hs.setBackupAnswer(SERVER_ERROR);
                }
                return answer;
            }) as typeof fetch,
        };
        mx = createFakeKeyClient(seen);
        await mx.initRustCrypto({ useIndexedDB: false });
        hs.failNext('POST', '/room_keys/version', SERVER_ERROR);

        mounted = await renderWithClient(
            mx,
            <DeviceVerificationSetup onCancel={() => undefined} />
        );
        await waitFor(() => bodyText().includes('Setup Device Verification'), {
            what: 'the setup dialog',
        });
        await submit();
        await waitFor(() => bodyText().includes(SETUP_PARTWAY_TEXT.backup_unclear.what), {
            what: 'the attempt to stop at the backup',
            timeoutMs: 30_000,
        });
        expect(buttonsNamed('Continue')).toEqual([]);
        expect(bodyText()).not.toContain(SETUP_PARTWAY_TEXT.backup_none.what);
        const partwayKey = await shownRecoveryKey();
        expect(await opensDefaultSecretStorage(hs, partwayKey)).toBe(true);
        hs.setBackupAnswer(undefined);
    }, 90_000);

    it('secret storage’s own setup failed: the key is shown with “may”, and Continue finishes with it', async () => {
        // `bootstrapSecretStorage` writes the key's description, then the
        // default key, then the secrets; its error doesn't say how far it got.
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });
        hs.failNext('PUT', '/account_data/m.secret_storage.default_key', SERVER_ERROR);

        mounted = await renderWithClient(
            mx,
            <DeviceVerificationSetup onCancel={() => undefined} />
        );
        await waitFor(() => bodyText().includes('Setup Device Verification'), {
            what: 'the setup dialog',
        });
        await submit();
        await waitFor(() => bodyText().includes(SETUP_PARTWAY_TEXT.secret_storage.what), {
            what: 'the attempt to stop in secret storage',
            timeoutMs: 30_000,
        });
        expect(bodyText()).toContain(SETUP_PARTWAY_TEXT.secret_storage.next as string);
        expect(hs.masterKey()).toBeNull();
        expect(signingUploads(hs)).toBe(0);
        const partwayKey = await shownRecoveryKey();

        await submit();
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the recovery key screen',
            timeoutMs: 30_000,
        });
        const finalKey = await shownRecoveryKey();
        expect(finalKey).toBe(partwayKey);
        expect(await opensDefaultSecretStorage(hs, finalKey)).toBe(true);
        expect(hs.backupVersion()).toBe('1');
    }, 90_000);
});

describe('DeviceVerificationReset: cancelled at the account confirmation', () => {
    it('shows the new recovery key and a real message, and Continue finishes the reset with that key', async () => {
        // The verifier's case. On a device that holds the account's
        // cross-signing, with no backup, the warned reset replaces secret
        // storage (re-storing the cross-signing keys under the new key), then
        // `resetCrossSigning` makes new keys, stores them there and stops at
        // the password. Before the fix a cancel there left the account's
        // secret storage under a key never shown, and the form's error line
        // rendered an empty <b> (the cancel rejected with the click event).
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });
        mounted = await renderWithClient(
            mx,
            <DeviceVerificationSetup onCancel={() => undefined} />
        );
        await submit();
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the first setup',
            timeoutMs: 30_000,
        });
        await waitFor(() => hs.accountData.has('m.megolm_backup.v1'), {
            what: 'the backup key stored',
            timeoutMs: 15_000,
        });
        await settle(50);
        mounted.unmount();
        mounted = undefined;
        document.body.innerHTML = '';
        expect(await mx.getCrypto()?.isCrossSigningReady()).toBe(true);
        // The backup is deleted elsewhere, so the reset's check answers "none".
        hs.setBackupVersion(null);
        const defaultBefore = defaultKeyId(hs);
        const masterBefore = hs.masterKey();
        // The private master key of the account's identity, as secret storage
        // holds it (this device caches the first setup's secret-storage key).
        const masterSecretBefore = await mx.secretStorage.get('m.cross_signing.master');
        expect(masterSecretBefore).toBeTruthy();

        mounted = await renderWithClient(
            mx,
            <DeviceVerificationReset onCancel={() => undefined} />
        );
        await click(buttonsNamed('Reset')[0]);
        await submit();
        await waitFor(() => bodyText().includes('Account Password'), {
            what: 'the password stage',
            timeoutMs: 30_000,
        });
        await cancelPassword();
        await waitFor(() => bodyText().includes(SETUP_CONFIRM_CANCELLED_TEXT), {
            what: 'the cancel message',
            timeoutMs: 15_000,
        });

        // What had already changed: a new default key; cross-signing not.
        expect(defaultKeyId(hs)).not.toBe(defaultBefore);
        expect(hs.masterKey()).toBe(masterBefore);
        expect(hs.backupVersion()).toBeNull();
        // And secret storage now holds a master key the homeserver never
        // received (`resetCrossSigning` stores before it uploads): the
        // account's own one is no longer in it.
        const masterSecretAfter = await mx.secretStorage.get('m.cross_signing.master');
        expect(masterSecretAfter).toBeTruthy();
        expect(masterSecretAfter).not.toBe(masterSecretBefore);
        expect(bodyText()).toContain(SETUP_PARTWAY_TEXT.cross_signing.what);
        expect(bodyText()).toContain(SETUP_PARTWAY_TEXT.cross_signing.next as string);
        expect(bodyText()).not.toContain('Account Password');
        const errorLine = Array.from(document.body.querySelectorAll('b')).find(
            (b) => b.textContent === SETUP_CONFIRM_CANCELLED_TEXT
        );
        expect(errorLine).toBeDefined();
        expect(
            Array.from(document.body.querySelectorAll('b')).some((b) => b.textContent === '')
        ).toBe(false);
        const partwayKey = await shownRecoveryKey();
        expect(await opensDefaultSecretStorage(hs, partwayKey)).toBe(true);

        await submit();
        await waitFor(() => bodyText().includes('Account Password'), {
            what: 'the password stage again',
            timeoutMs: 30_000,
        });
        await enterPassword();
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the finished reset',
            timeoutMs: 30_000,
        });
        expect(hs.masterKey()).not.toBe(masterBefore);
        expect(hs.backupVersion()).not.toBeNull();
        expect(hs.calls.filter((c) => c.method === 'DELETE')).toEqual([]);
        const finalKey = await shownRecoveryKey();
        expect(finalKey).toBe(partwayKey);
        expect(await opensDefaultSecretStorage(hs, finalKey)).toBe(true);
    }, 120_000);
});
