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
import { DeviceVerificationSetup } from '../../../src/app/components/DeviceVerificationSetup';
import { SETUP_REFUSED_TEXT, SETUP_STOPPED_PARTWAY_TEXT } from '../../../src/client/keyBackupCheck';
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
    await waitFor(() => bodyText().includes(SETUP_STOPPED_PARTWAY_TEXT), {
        what: 'the first attempt to stop partway',
        timeoutMs: 30_000,
    });
    const ownKey = hs.masterKey();
    expect(ownKey).not.toBeNull();
    expect(ownKey).not.toBe(OLD_MASTER_KEY);
    expect(hs.backupVersion()).toBeNull();
    expect(bodyText()).toContain('Internal server error');
    expect(bodyText()).not.toContain(RECOVERY_KEY_SCREEN);
    expect(signingUploads(hs)).toBe(1);
    return { hs, ownKey: ownKey as string };
};

describe('SetupVerification: a setup that failed partway', () => {
    it('the next Continue keeps the form’s own cross-signing and creates the backup', async () => {
        const { hs, ownKey } = await firstAttemptFailsAtTheBackup();
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
        expect(bodyText()).not.toContain(SETUP_STOPPED_PARTWAY_TEXT);
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
        // Its cross-signing step did not finish, so the form claims nothing about it.
        expect(bodyText()).not.toContain(SETUP_STOPPED_PARTWAY_TEXT);

        await submit();
        await waitFor(() => bodyText().includes('Account Password'), {
            what: 'the password stage',
            timeoutMs: 30_000,
        });
        expect(bodyText()).not.toContain(SETUP_REFUSED_TEXT.crossSigning);
        const pw = document.body.querySelector('input[name="passwordInput"]') as HTMLInputElement;
        pw.value = 'correct horse battery staple';
        const pwForm = pw.closest('form') as HTMLFormElement;
        // PasswordStage reads `form.passwordInput`, the form's named-property
        // getter, which browsers provide and jsdom does not.
        Object.defineProperty(pwForm, 'passwordInput', { value: pw, configurable: true });
        await submitForm(pwForm);

        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the recovery key screen',
            timeoutMs: 30_000,
        });
        expect(hs.masterKey()).not.toBe(firstKey);
        expect(hs.backupVersion()).toBe('1');
        expect(hs.calls.filter((c) => c.method === 'DELETE')).toEqual([]);
    }, 90_000);
});
