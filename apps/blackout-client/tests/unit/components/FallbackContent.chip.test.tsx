// @vitest-environment jsdom
//
// The undecryptable-message chip (`MessageBadEncryptedContent`), with a real
// `MatrixClient` on `createFakeKeyHomeserver` and a stubbed `getCrypto()` for
// this device. On develop the chip read "Set up backup" and chose its flow from
// account data alone, so an account with a backup and no cross-signing was
// offered the from-scratch setup, which deletes that backup (S9,
// `docs/security/key-backup-nudge-2026-11-02.md`).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';

// Folds overlays wrap their content in focus-trap-react, which in jsdom finds
// no tabbable node (no layout) and throws. The existing overlay tests render it
// as a pass-through for the same reason.
vi.mock('focus-trap-react', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import {
    CHIP_BACKUP_EXISTS,
    CHIP_CHECKING,
    CHIP_CHECK_FAILED,
    CHIP_LABEL,
    CHIP_NOT_VERIFIED,
    CHIP_OFFER_RESET,
    CHIP_OFFER_SETUP,
    CHIP_SETUP_WONT_FIX,
    CHIP_TEXT,
    MessageBadEncryptedContent,
} from '../../../src/app/components/message/content/FallbackContent';
import { KEY_BACKUP_NUDGE_TEXT } from '../../../src/app/features/settings/security/encryptionPosture';
import {
    createFakeKeyClient,
    createFakeKeyHomeserver,
    type FakeKeyHomeserverOptions,
} from '../helpers/fakeKeyHomeserver';
import {
    backupVersionGets,
    bodyText,
    buttonsNamed,
    click,
    destructiveCryptoCalls,
    renderWithClient,
    settle,
    stubCrypto,
    submitForm,
    unhandledRejectionsDuring,
    waitFor,
    type CryptoStubOptions,
} from '../helpers/keyBackupRender';
import type { MountedDialog } from '../helpers/modalReliability';

const SETUP_HEADING = 'Setup Device Verification';
const RESET_HEADING = 'Reset Device Verification';
const SET_UP_BACKUP = 'Set up backup';
const RECOVERY_KEY_SCREEN = 'Store the Recovery Key in a safe place';

let mounted: MountedDialog | undefined;
/** A client with real crypto started, stopped after the case. */
let realCryptoClient: MatrixClient | undefined;

const renderChip = async (server: FakeKeyHomeserverOptions, device: CryptoStubOptions) => {
    const hs = createFakeKeyHomeserver(server);
    const mx = createFakeKeyClient(hs);
    const crypto = stubCrypto(mx, device);
    mounted = await renderWithClient(mx, <MessageBadEncryptedContent />);
    return { hs, mx, crypto };
};

const clickWhy = async () => {
    const why = buttonsNamed(CHIP_LABEL);
    expect(why).toHaveLength(1);
    await click(why[0]);
};

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    realCryptoClient?.stopClient();
    realCryptoClient = undefined;
    vi.restoreAllMocks();
});

describe('MessageBadEncryptedContent chip', () => {
    it('reads the chip text and label, and nothing about a backup having avoided it', async () => {
        await renderChip({ backupVersion: '3' }, { crossSigningReady: false });
        expect(bodyText()).toContain(CHIP_TEXT);
        expect(buttonsNamed(CHIP_LABEL)).toHaveLength(1);
        expect(buttonsNamed('Set up backup')).toHaveLength(0);
        expect(bodyText()).not.toMatch(/before this device had your/i);
    });

    it('a click shows the checking text first', async () => {
        const { hs } = await renderChip(
            { backupAnswer: { kind: 'hang-ignoring-abort' } },
            { crossSigningReady: false }
        );
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_CHECKING), { what: 'the checking text' });
        expect(hs.calls.some((c) => c.path.endsWith('/room_keys/version'))).toBe(true);
        expect(bodyText()).not.toContain(SETUP_HEADING);
    });

    it('account has a backup, no cross-signing (develop opened the setup here): the backup text, no setup', async () => {
        const { crypto, hs } = await renderChip(
            { backupVersion: '3', masterKey: false },
            { crossSigningReady: false }
        );
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_BACKUP_EXISTS), { what: 'the backup text' });
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(bodyText()).not.toContain(RESET_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(hs.destructiveCalls()).toEqual([]);
        await click(buttonsNamed('Close')[0]);
        await waitFor(() => !bodyText().includes(CHIP_BACKUP_EXISTS), {
            what: 'the panel to close',
        });
    });

    it('account has a backup and cross-signing, device not verified: the backup text, no reset', async () => {
        const { crypto } = await renderChip(
            { backupVersion: '3', masterKey: true },
            { crossSigningReady: false }
        );
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_BACKUP_EXISTS), { what: 'the backup text' });
        expect(bodyText()).not.toContain(RESET_HEADING);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
    });

    it('the backup check fails: the check-failed text, no setup', async () => {
        const { crypto } = await renderChip(
            { backupAnswer: { kind: 'reject' }, masterKey: false },
            { crossSigningReady: false }
        );
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_CHECK_FAILED), { what: 'the failed text' });
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(buttonsNamed('Close')).toHaveLength(1);
    });

    it('cross-signing on the server, this device not verified: the not-verified text, no reset', async () => {
        // Behaviour change recorded under S9: develop offered the warned
        // reset here, from account data alone.
        const { crypto } = await renderChip(
            { backupVersion: null, masterKey: true },
            { crossSigningReady: false }
        );
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_NOT_VERIFIED), {
            what: 'the not-verified text',
        });
        expect(bodyText()).not.toContain(RESET_HEADING);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
    });

    it('nothing on the server: explains first, then "Set up backup" checks again and opens the from-scratch setup', async () => {
        const { hs, crypto } = await renderChip(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false }
        );
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_OFFER_SETUP), { what: 'the explanation' });
        // "Why?" explains: no flow yet, and the text says the setup won't
        // make this message readable.
        expect(bodyText()).toContain(CHIP_SETUP_WONT_FIX);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(buttonsNamed('Close')).toHaveLength(1);
        const before = backupVersionGets(hs.calls);
        await click(buttonsNamed(SET_UP_BACKUP)[0]);
        await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
        expect(backupVersionGets(hs.calls)).toBe(before + 1);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
    });

    it('cross-signing this device trusts, no backup: explains first, then "Set up backup" opens the warned reset', async () => {
        await renderChip({ backupVersion: null, masterKey: true }, { crossSigningReady: true });
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_OFFER_RESET), { what: 'the explanation' });
        expect(bodyText()).not.toContain(RESET_HEADING);
        await click(buttonsNamed(SET_UP_BACKUP)[0]);
        await waitFor(() => bodyText().includes(RESET_HEADING), { what: 'the reset dialog' });
        expect(bodyText()).toContain('Resetting device verification is permanent.');
    });

    it('a backup created after the explanation: "Set up backup" shows the backup text, not the setup', async () => {
        const { hs, crypto } = await renderChip(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false }
        );
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_OFFER_SETUP), { what: 'the explanation' });
        hs.setBackupVersion('3');
        hs.setMasterKey(true);
        await click(buttonsNamed(SET_UP_BACKUP)[0]);
        await waitFor(() => bodyText().includes(CHIP_BACKUP_EXISTS), { what: 'the backup text' });
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(buttonsNamed(SET_UP_BACKUP)).toHaveLength(0);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(hs.destructiveCalls()).toEqual([]);
    });

    it('a device check that rejects: the check-failed text, no setup, no rejection escapes', async () => {
        const { crypto } = await renderChip(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false }
        );
        crypto.isCrossSigningReady.mockRejectedValue(new Error('crypto not ready'));
        const unhandled = await unhandledRejectionsDuring(async () => {
            await clickWhy();
            await waitFor(() => bodyText().includes(CHIP_CHECK_FAILED), {
                what: 'the failed text',
            });
        });
        expect(unhandled).toEqual([]);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
    });

    it('the chip text is true of every undecryptable message, whatever the cause', () => {
        expect(CHIP_TEXT).toBe('Can’t decrypt this message on this device.');
        expect(CHIP_TEXT).not.toMatch(/doesn.t have its key/);
        expect(CHIP_CHECK_FAILED).toMatch(/key backup or cross-signing/);
    });

    it('the not-verified text says what is closed to this device, and promises a late key only what it can do', () => {
        // Round 4 of S9: "so it can’t get this message’s key." was absolute.
        // What is closed is a backup and the account's other sessions
        // (room-key requests are off).
        expect(CHIP_NOT_VERIFIED).not.toMatch(/can’t get this message’s key\./);
        expect(CHIP_NOT_VERIFIED).toMatch(/from a backup or from your other sessions/);
        // Round 6: "If the sender’s device sends the key later, the message
        // becomes readable here." promised a recovery that this row's usual
        // case rules out. A Megolm session the sender shares later starts at
        // its current index (`UnknownMessageIndex` for an earlier message),
        // and a sender that withholds from unverified devices sends nothing.
        // The SDK retries the event when a key arrives; only a key that was
        // merely delayed makes it readable.
        expect(CHIP_NOT_VERIFIED).not.toMatch(/sends the key later/);
        expect(CHIP_NOT_VERIFIED).toMatch(
            /If this message’s key was only delayed, it becomes readable here when the key arrives; a message sent before this device signed in stays unreadable here\./
        );
        expect(CHIP_NOT_VERIFIED).toMatch(
            /Another of your sessions that has the key can still read it\./
        );
    });

    it('the offer texts say the setup won’t make this message readable, then the nudge’s text for the row', () => {
        expect(CHIP_SETUP_WONT_FIX).toBe(
            'Setting up a backup won’t, by itself, make this message readable: a new backup starts with only the keys this device already has.'
        );
        expect(CHIP_OFFER_SETUP).toBe(
            `${CHIP_SETUP_WONT_FIX} ${KEY_BACKUP_NUDGE_TEXT.none.detail}`
        );
        expect(CHIP_OFFER_RESET).toBe(
            `${CHIP_SETUP_WONT_FIX} ${KEY_BACKUP_NUDGE_TEXT.crossSigningReady.detail}`
        );
    });
});

describe('MessageBadEncryptedContent chip: a late answer never replaces a later one', () => {
    // Round 3 of S9. A check that was superseded by a later click, or whose
    // overlay was closed, must not set the overlay when its answer arrives.

    it('close during the check, a backup appears, click again: the late "none" does not replace the backup text', async () => {
        const { hs, crypto } = await renderChip(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false }
        );
        const release = hs.delayNextBackupAnswer();
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_CHECKING), { what: 'the checking text' });
        await click(buttonsNamed('Close')[0]);
        // Another device of the account sets up cross-signing and a backup.
        hs.setBackupVersion('3');
        hs.setMasterKey(true);
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_BACKUP_EXISTS), { what: 'the backup text' });

        release(); // the first click's answer, "none", arrives now
        await settle(50);
        expect(bodyText()).toContain(CHIP_BACKUP_EXISTS);
        expect(bodyText()).not.toContain(CHIP_OFFER_SETUP);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(buttonsNamed(SET_UP_BACKUP)).toHaveLength(0);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(hs.destructiveCalls()).toEqual([]);
    });

    it('close during the check: the late answer does not reopen the overlay', async () => {
        const { hs } = await renderChip(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false }
        );
        const release = hs.delayNextBackupAnswer();
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_CHECKING), { what: 'the checking text' });
        await click(buttonsNamed('Close')[0]);
        await waitFor(() => !bodyText().includes(CHIP_CHECKING), { what: 'the overlay to close' });

        release();
        await settle(50);
        expect(bodyText()).not.toContain(CHIP_OFFER_SETUP);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(buttonsNamed('Close')).toHaveLength(0);
    });

    it('the explanation’s "Set up backup" is dropped too when the overlay was closed before its answer', async () => {
        const { hs, crypto } = await renderChip(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false }
        );
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_OFFER_SETUP), { what: 'the explanation' });
        const release = hs.delayNextBackupAnswer();
        await click(buttonsNamed(SET_UP_BACKUP)[0]);
        await waitFor(() => bodyText().includes(CHIP_CHECKING), { what: 'the checking text' });
        await click(buttonsNamed('Close')[0]);
        release();
        await settle(50);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(document.body.querySelector('form')).toBeNull();
        expect(destructiveCryptoCalls(crypto)).toBe(0);
    });

    it('submitting a setup opened by a fresh answer still goes through the form’s own check', async () => {
        // The ordering fix must not stop the legitimate path.
        const { hs, crypto } = await renderChip(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false }
        );
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_OFFER_SETUP), { what: 'the explanation' });
        await click(buttonsNamed(SET_UP_BACKUP)[0]);
        await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
        const before = backupVersionGets(hs.calls);
        await submitForm(document.body.querySelector('form') as HTMLFormElement);
        await waitFor(() => crypto.resetKeyBackup.mock.calls.length === 1, {
            what: 'the setup calls',
        });
        expect(backupVersionGets(hs.calls)).toBe(before + 1);
    });
});

describe('MessageBadEncryptedContent chip: a brand-new account, real crypto', () => {
    // Fifth review. On develop the chip chose its flow from account data at
    // every render, so once the setup wrote `m.cross_signing.master` the
    // overlay switched to "Reset Device Verification" and the new recovery
    // key was never shown (the S9 record, "Reproduced how"). The guard's
    // overlay follows its own panel, so the recovery key stays on screen.
    it('the setup goes through, nothing is deleted, and its recovery key stays on screen after account data gains cross-signing', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        realCryptoClient = createFakeKeyClient(hs);
        await realCryptoClient.initRustCrypto({ useIndexedDB: false });
        mounted = await renderWithClient(realCryptoClient, <MessageBadEncryptedContent />);
        await clickWhy();
        await waitFor(() => bodyText().includes(CHIP_OFFER_SETUP), {
            what: 'the explanation',
            timeoutMs: 15_000,
        });
        await click(buttonsNamed(SET_UP_BACKUP)[0]);
        await waitFor(() => bodyText().includes(SETUP_HEADING), {
            what: 'the setup dialog',
            timeoutMs: 15_000,
        });
        await submitForm(document.body.querySelector('form') as HTMLFormElement);
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the recovery key screen',
            timeoutMs: 20_000,
        });
        // The setup's last write, then time for the account-data echoes.
        await waitFor(() => hs.accountData.has('m.megolm_backup.v1'), {
            what: 'the backup key in secret storage',
            timeoutMs: 15_000,
        });
        await settle(200);
        expect(hs.accountData.has('m.cross_signing.master')).toBe(true);
        expect(bodyText()).toContain(RECOVERY_KEY_SCREEN);
        expect(bodyText()).not.toContain(RESET_HEADING);
        expect(hs.backupVersion()).toBe('1');
        expect(hs.masterKey()).not.toBeNull();
        expect(hs.calls.filter((c) => c.method === 'DELETE')).toEqual([]);
    }, 60_000);
});
