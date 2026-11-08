// @vitest-environment jsdom
//
// Closing the setup or reset dialog during an attempt (S9,
// `docs/security/key-backup-nudge-2026-11-02.md`, seventh review).
//
// The setup form's own last check (`checkAccountKeyState`) can wait up to
// ACCOUNT_KEY_CHECK_TIMEOUT_MS a request, with a spinner on Continue and the
// dialog's ✕ live. Before the fix, a close in that window unmounted the form,
// but the attempt went on: it replaced secret storage (and in a setup,
// uploaded cross-signing and made a backup) with nothing on screen, and its
// recovery key was never shown. Now:
//
// - a close before the first write stops the attempt, and it writes nothing;
// - from the first write until the attempt settles, the dialog's ✕ is
//   disabled and refuses to close it, so a close can't take the window away
//   before it shows the attempt's recovery key (the finished one, or the
//   partway one). The window can still go by another route (a browser's
//   Back, the chip's host closing): DeviceVerificationSetup.windowGone.test.tsx
//   covers that, where the key is then shown by `RecoveryKeyHandoffHost`, and
//   the record's "What remains" lists what still loses it (eighth review).
//
// Every case goes through a real entry (the nudge's banner, the chip's
// overlay, the legacy Devices page's Reset) and a real `MatrixClient` that
// talks to `createFakeKeyHomeserver`. The form's check is held with
// `delayNextBackupAnswer`, the ✕ clicked, then the answer released. The first
// group stubs this device's crypto (the three setup calls are counted); the
// second runs real Rust crypto in memory and lists the homeserver's writes.
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
import { DeviceVerificationReset } from '../../../src/app/components/DeviceVerificationSetup';
import { MessageBadEncryptedContent } from '../../../src/app/components/message/content/FallbackContent';
import { KeyBackupNudge } from '../../../src/app/features/settings/security/KeyBackupNudge';
import { SETUP_PARTWAY_TEXT, SETUP_WRITING_TEXT } from '../../../src/client/keyBackupCheck';
import {
    createFakeKeyClient,
    createFakeKeyHomeserver,
    type FakeKeyHomeserver,
} from '../helpers/fakeKeyHomeserver';
import {
    bodyText,
    buttonsNamed,
    click,
    destructiveCryptoCalls,
    renderWithClient,
    settle,
    stubCrypto,
    submitForm,
    waitFor,
    type CryptoStub,
} from '../helpers/keyBackupRender';
import type { MountedDialog } from '../helpers/modalReliability';

const SETUP_HEADING = 'Setup Device Verification';
const RESET_HEADING = 'Reset Device Verification';
const RECOVERY_KEY_SCREEN = 'Store the Recovery Key in a safe place';

let mounted: MountedDialog | undefined;
let mx: MatrixClient | undefined;

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
});

afterEach(async () => {
    mounted?.unmount();
    mounted = undefined;
    if (mx) {
        // A finished setup starts the SDK's backup check without awaiting it;
        // let it finish before the Rust machine closes.
        await mx.getCrypto()?.checkKeyBackupAndEnable();
        await settle(20);
        mx.stopClient();
    }
    mx = undefined;
    vi.restoreAllMocks();
});

/** The ✕ in the header of the dialog titled `heading`. */
const headerClose = (heading: string): HTMLButtonElement => {
    const title = Array.from(document.body.querySelectorAll('*')).find(
        (el) => el.children.length === 0 && el.textContent === heading
    ) as HTMLElement | undefined;
    expect(title, `the heading ${heading}`).toBeDefined();
    let node: HTMLElement | null = title as HTMLElement;
    while (node && !node.querySelector('button')) node = node.parentElement;
    return (node as HTMLElement).querySelector('button') as HTMLButtonElement;
};

const submit = async () => {
    const form = document.body.querySelector('form');
    expect(form).not.toBeNull();
    await submitForm(form as HTMLFormElement);
};

/** A promise the test settles by hand. */
const held = () => {
    let release: () => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const promise = new Promise<void>((resolve, reject) => {
        release = resolve;
        fail = reject;
    });
    return { promise, release, fail };
};

/** Presses Continue with the form's check held, clicks the dialog's ✕, then lets the check answer. */
const closeDuringTheCheck = async (hs: FakeKeyHomeserver, heading: string) => {
    const release = hs.delayNextBackupAnswer();
    await submit();
    await settle(20);
    const close = headerClose(heading);
    expect(close.disabled, 'the ✕ is live while the check runs').toBe(false);
    await click(close);
    await settle(20);
    expect(bodyText()).not.toContain(heading);
    release();
};

/** The nudge's row 1 (nothing on the account) to its setup dialog. */
const openNudgeSetup = async (hs: FakeKeyHomeserver, client: MatrixClient) => {
    mounted = await renderWithClient(client, <KeyBackupNudge />);
    await waitFor(() => buttonsNamed('Set up backup').length > 0, {
        what: 'row 1',
        timeoutMs: 15_000,
    });
    await click(buttonsNamed('Set up backup')[0]);
    await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
    expect(hs.destructiveCalls()).toEqual([]);
};

/** The nudge's row 2 (cross-signing this device trusts, no backup) to the reset form. */
const openNudgeReset = async (client: MatrixClient) => {
    mounted = await renderWithClient(client, <KeyBackupNudge />);
    await waitFor(() => buttonsNamed('Set up backup').length > 0, {
        what: 'row 2',
        timeoutMs: 15_000,
    });
    await click(buttonsNamed('Set up backup')[0]);
    await waitFor(() => buttonsNamed('Reset').length > 0, { what: 'the reset warning' });
    await click(buttonsNamed('Reset')[0]);
    await waitFor(() => document.body.querySelector('form') !== null, { what: 'the form' });
};

/** A dialog that unmounts on its ✕, as every caller's does. */
function ClosableReset() {
    const [open, setOpen] = React.useState(true);
    return open ? <DeviceVerificationReset onCancel={() => setOpen(false)} /> : null;
}

const nothingWritten = (crypto: CryptoStub, hs: FakeKeyHomeserver) => {
    expect(crypto.bootstrapSecretStorage).not.toHaveBeenCalled();
    expect(crypto.bootstrapCrossSigning).not.toHaveBeenCalled();
    expect(crypto.resetKeyBackup).not.toHaveBeenCalled();
    expect(destructiveCryptoCalls(crypto)).toBe(0);
    expect(hs.destructiveCalls()).toEqual([]);
};

describe('a close during the form’s check writes nothing (stubbed crypto)', () => {
    it('the nudge’s setup (row 1)', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: false });
        await openNudgeSetup(hs, client);
        await closeDuringTheCheck(hs, SETUP_HEADING);
        await settle(200);
        nothingWritten(crypto, hs);
        expect(bodyText()).not.toContain(SETUP_HEADING);
    }, 20_000);

    it('the nudge’s reset (row 2)', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: true });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: true });
        await openNudgeReset(client);
        await closeDuringTheCheck(hs, RESET_HEADING);
        await settle(200);
        nothingWritten(crypto, hs);
    }, 20_000);

    it('the chip’s setup (row 1, after its explanation)', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: false });
        mounted = await renderWithClient(client, <MessageBadEncryptedContent />);
        await click(buttonsNamed('Why?')[0]);
        await waitFor(() => buttonsNamed('Set up backup').length > 0, { what: 'the offer' });
        await click(buttonsNamed('Set up backup')[0]);
        await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
        await closeDuringTheCheck(hs, SETUP_HEADING);
        await settle(200);
        nothingWritten(crypto, hs);
    }, 20_000);

    it('a reset dialog that unmounts on its ✕ (the Devices page’s Reset)', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: true });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: true });
        mounted = await renderWithClient(client, <ClosableReset />);
        await click(buttonsNamed('Reset')[0]);
        await waitFor(() => document.body.querySelector('form') !== null, { what: 'the form' });
        await closeDuringTheCheck(hs, RESET_HEADING);
        await settle(200);
        nothingWritten(crypto, hs);
    }, 20_000);
});

describe('from the first write until the attempt settles, the dialog does not close', () => {
    it('setup: the ✕ is disabled while cross-signing is written; the recovery key then shows', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: false });
        const step = held();
        crypto.bootstrapCrossSigning.mockImplementationOnce(async () => {
            await step.promise;
        });
        await openNudgeSetup(hs, client);
        await submit();
        await waitFor(() => crypto.bootstrapCrossSigning.mock.calls.length === 1, {
            what: 'the cross-signing step',
        });
        const close = headerClose(SETUP_HEADING);
        expect(close.disabled).toBe(true);
        expect(bodyText()).toContain(SETUP_WRITING_TEXT);
        await click(close);
        await settle(50);
        expect(bodyText()).toContain(SETUP_HEADING);
        expect(crypto.resetKeyBackup).not.toHaveBeenCalled();

        step.release();
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the recovery key screen',
        });
        expect(crypto.resetKeyBackup).toHaveBeenCalledTimes(1);
        expect(bodyText()).not.toContain(SETUP_WRITING_TEXT);
        const closeAfter = headerClose(SETUP_HEADING);
        expect(closeAfter.disabled).toBe(false);
        await click(closeAfter);
        await waitFor(() => !bodyText().includes(SETUP_HEADING), { what: 'the dialog to close' });
    }, 20_000);

    it('reset: the ✕ is disabled while secret storage is written; a failure then shows the partway key and frees it', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: true });
        const client = createFakeKeyClient(hs);
        const crypto = stubCrypto(client, { crossSigningReady: true });
        const step = held();
        crypto.bootstrapSecretStorage.mockImplementationOnce(async () => {
            await step.promise;
        });
        await openNudgeReset(client);
        await submit();
        await waitFor(() => crypto.bootstrapSecretStorage.mock.calls.length === 1, {
            what: 'the secret-storage step',
        });
        const close = headerClose(RESET_HEADING);
        expect(close.disabled).toBe(true);
        await click(close);
        await settle(50);
        expect(bodyText()).toContain(RESET_HEADING);

        step.fail(new Error('Internal server error'));
        await waitFor(() => bodyText().includes(SETUP_PARTWAY_TEXT.secret_storage.what), {
            what: 'the partway screen',
        });
        expect(buttonsNamed('Show')).toHaveLength(1);
        expect(headerClose(RESET_HEADING).disabled).toBe(false);
    }, 20_000);
});

/** The account's default secret-storage key id as the homeserver holds it. */
const defaultKeyId = (hs: FakeKeyHomeserver): string | undefined =>
    (hs.accountData.get('m.secret_storage.default_key') as { key?: string } | undefined)?.key;

const opensDefault = async (hs: FakeKeyHomeserver, recoveryKey: string): Promise<boolean> => {
    const keyId = defaultKeyId(hs);
    if (!keyId || !mx) return false;
    const info = hs.accountData.get(`m.secret_storage.key.${keyId}`) as
        | SecretStorageKeyDescription
        | undefined;
    if (!info) return false;
    return mx.secretStorage.checkKey(decodeRecoveryKey(recoveryKey), info);
};

describe('a close during the form’s check writes nothing (real crypto)', () => {
    it('the nudge’s reset: secret storage and cross-signing stay as they were', async () => {
        // The verifier's case: this device set the account up earlier
        // (secret storage under an old key, then cross-signing, trusted
        // here); no backup. Before the fix the close was followed by new
        // secret storage, re-stored cross-signing secrets and an upload.
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });
        const crypto = mx.getCrypto();
        if (!crypto) throw new Error('no crypto');
        const oldKey = await crypto.createRecoveryKeyFromPassphrase();
        await crypto.bootstrapSecretStorage({
            createSecretStorageKey: async () => oldKey,
            setupNewSecretStorage: true,
        });
        await crypto.bootstrapCrossSigning({ setupNewCrossSigning: true });
        await settle(100);
        expect(await crypto.isCrossSigningReady()).toBe(true);
        const masterBefore = hs.masterKey();
        const defaultBefore = defaultKeyId(hs);
        const masterSecretBefore = JSON.stringify(hs.accountData.get('m.cross_signing.master'));
        expect(await opensDefault(hs, oldKey.encodedPrivateKey as string)).toBe(true);

        await openNudgeReset(mx);
        const callsBefore = hs.calls.length;
        await closeDuringTheCheck(hs, RESET_HEADING);
        await settle(3000);

        const writes = hs.calls
            .slice(callsBefore)
            .filter(
                (c) =>
                    c.method !== 'GET' &&
                    !(c.method === 'POST' && c.path.endsWith('/keys/query')) &&
                    !(c.method === 'POST' && c.path.endsWith('/keys/upload'))
            )
            .map((c) => `${c.method} ${c.path}`);
        expect(writes).toEqual([]);
        expect(defaultKeyId(hs)).toBe(defaultBefore);
        expect(hs.masterKey()).toBe(masterBefore);
        expect(JSON.stringify(hs.accountData.get('m.cross_signing.master'))).toBe(
            masterSecretBefore
        );
        expect(await opensDefault(hs, oldKey.encodedPrivateKey as string)).toBe(true);
    }, 60_000);

    it('the nudge’s setup: no secret storage, cross-signing or backup is made', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        mx = createFakeKeyClient(hs);
        await mx.initRustCrypto({ useIndexedDB: false });
        await openNudgeSetup(hs, mx);
        await closeDuringTheCheck(hs, SETUP_HEADING);
        await settle(3000);
        expect(hs.destructiveCalls()).toEqual([]);
        expect(hs.masterKey()).toBeNull();
        expect(hs.backupVersion()).toBeNull();
        expect(defaultKeyId(hs)).toBeUndefined();
    }, 60_000);
});
