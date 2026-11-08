// @vitest-environment jsdom
//
// The key-backup nudge, rendered with a real `MatrixClient` whose `fetchFn`
// is `createFakeKeyHomeserver` (so the guard's two reads go through the SDK's
// HTTP layer) and a stubbed `getCrypto()` for THIS device's state, which on a
// new device is always "not ready, no active backup".
//
// The defect these pin (S9, `docs/security/key-backup-nudge-2026-11-02.md`):
// on develop the nudge decided from this device's state alone, so on every
// new device it offered "Set up backup", which opens the from-scratch setup,
// which replaces the account's secret storage and cross-signing and deletes
// every key backup version the account has. The first block shows what the
// stubbed setup calls receive when the from-scratch flow is submitted; the
// rest show that the guard offers it only when the homeserver answered that
// there is nothing to replace.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api';

// Folds overlays wrap their content in focus-trap-react, which in jsdom finds
// no tabbable node (no layout) and throws. The existing overlay tests render it
// as a pass-through for the same reason.
vi.mock('focus-trap-react', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import { KeyBackupNudge } from '../../../../src/app/features/settings/security/KeyBackupNudge';
import {
    KEY_BACKUP_NUDGE_ACTION_LABEL,
    KEY_BACKUP_NUDGE_TEXT,
} from '../../../../src/app/features/settings/security/encryptionPosture';
import {
    createFakeKeyClient,
    createFakeKeyHomeserver,
    type FakeKeyHomeserverOptions,
} from '../../helpers/fakeKeyHomeserver';
import {
    backupVersionGets,
    bodyText,
    buttonsLabelled,
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
} from '../../helpers/keyBackupRender';
import type { MountedDialog } from '../../helpers/modalReliability';

const SETUP_HEADING = 'Setup Device Verification';
const RESET_HEADING = 'Reset Device Verification';
const RECOVERY_KEY_SCREEN = 'Store the Recovery Key in a safe place';

let mounted: MountedDialog | undefined;

const renderNudge = async (
    server: FakeKeyHomeserverOptions,
    device: CryptoStubOptions,
    headline: string
) => {
    const hs = createFakeKeyHomeserver(server);
    const mx = createFakeKeyClient(hs);
    const crypto = stubCrypto(mx, device);
    mounted = await renderWithClient(mx, <KeyBackupNudge />);
    await waitFor(() => bodyText().includes(headline), { what: `headline "${headline}"` });
    return { hs, mx, crypto };
};

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
});

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
});

describe('KeyBackupNudge: what "Set up backup" does when it is offered', () => {
    it('the from-scratch setup replaces secret storage and cross-signing and resets the backup', async () => {
        // The one row where the from-scratch setup is offered: the homeserver
        // answered 404 M_NOT_FOUND for the backup and has no master key.
        const { crypto } = await renderNudge(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.none.headline
        );
        await click(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)[0]);
        await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });

        const form = document.body.querySelector('form');
        expect(form).not.toBeNull();
        await submitForm(form as HTMLFormElement);
        await waitFor(() => crypto.resetKeyBackup.mock.calls.length === 1, {
            what: 'resetKeyBackup',
        });

        // These three calls are what S9 is about. The SDK's resetKeyBackup
        // deletes every backup version on the server before creating a new
        // one (rust-crypto/backup.js, setupKeyBackup → deleteAllKeyBackupVersions).
        expect(crypto.bootstrapSecretStorage).toHaveBeenCalledWith(
            expect.objectContaining({ setupNewSecretStorage: true })
        );
        expect(crypto.bootstrapCrossSigning).toHaveBeenCalledWith(
            expect.objectContaining({ setupNewCrossSigning: true })
        );
        expect(crypto.resetKeyBackup).toHaveBeenCalledTimes(1);
    });
});

describe('KeyBackupNudge: the account-level guard', () => {
    it('an account with a backup and cross-signing, on a new device: no action, and the setup calls are never reached', async () => {
        // S9's exact scenario. On develop this rendered "Set up backup" and
        // opened the from-scratch setup.
        const { crypto, hs } = await renderNudge(
            { backupVersion: '3', masterKey: true },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.backup.headline
        );
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.backup.detail);
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(bodyText()).not.toContain(RESET_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(hs.destructiveCalls()).toEqual([]);
        // Not now and the dismiss button still render.
        expect(buttonsNamed('Not now')).toHaveLength(1);
        expect(buttonsLabelled('Dismiss for now')).toHaveLength(1);
    });

    it('an account with a backup and no cross-signing: the backup text, no action', async () => {
        await renderNudge(
            { backupVersion: '3', masterKey: false },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.backup.headline
        );
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
    });

    it('the backup check never reaches a server: the unknown text, no action, no overlay', async () => {
        // The case a guard built on the SDK's getKeyBackupInfo() gets wrong:
        // it resolves null when its own request failed.
        const { crypto } = await renderNudge(
            { backupAnswer: { kind: 'reject' }, masterKey: false },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.unknown.headline
        );
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.unknown.detail);
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(buttonsNamed('Not now')).toHaveLength(1);
        expect(buttonsLabelled('Dismiss for now')).toHaveLength(1);
    });

    it('the backup check answers 500: the unknown text, no action', async () => {
        await renderNudge(
            {
                backupAnswer: {
                    kind: 'json',
                    status: 500,
                    body: { errcode: 'M_UNKNOWN', error: 'Internal server error' },
                },
                masterKey: false,
            },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.unknown.headline
        );
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
    });

    it('a 404 that is not M_NOT_FOUND is unknown, not "none"', async () => {
        await renderNudge(
            {
                backupAnswer: {
                    kind: 'json',
                    status: 404,
                    body: { errcode: 'M_UNRECOGNIZED', error: 'Unrecognized request' },
                },
                masterKey: false,
            },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.unknown.headline
        );
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
    });

    it('no backup, cross-signing on the server, this device not verified: the not-verified text, no action', async () => {
        const { crypto } = await renderNudge(
            { backupVersion: null, masterKey: true },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.crossSigningNotReady.headline
        );
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.crossSigningNotReady.detail);
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(buttonsNamed('Not now')).toHaveLength(1);
        expect(buttonsLabelled('Dismiss for now')).toHaveLength(1);
    });

    it('no backup, cross-signing this device trusts: "Set up backup" opens the warned reset, not the setup', async () => {
        await renderNudge(
            { backupVersion: null, masterKey: true },
            { crossSigningReady: true },
            KEY_BACKUP_NUDGE_TEXT.crossSigningReady.headline
        );
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.crossSigningReady.detail);
        const action = buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL);
        expect(action).toHaveLength(1);
        await click(action[0]);
        await waitFor(() => bodyText().includes(RESET_HEADING), { what: 'the reset dialog' });
        expect(bodyText()).toContain('Resetting device verification is permanent.');
        expect(bodyText()).not.toContain(SETUP_HEADING);
    });

    it('nothing on the server: "Set up backup" opens the from-scratch setup', async () => {
        await renderNudge(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.none.headline
        );
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.none.detail);
        const action = buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL);
        expect(action).toHaveLength(1);
        await click(action[0]);
        await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
        expect(buttonsNamed('Not now')).toHaveLength(1);
        expect(buttonsLabelled('Dismiss for now')).toHaveLength(1);
    });

    it('renders nothing while the homeserver has not answered', async () => {
        const hs = createFakeKeyHomeserver({
            backupAnswer: { kind: 'hang-ignoring-abort' },
            masterKey: false,
        });
        const mx = createFakeKeyClient(hs);
        stubCrypto(mx, { crossSigningReady: false });
        mounted = await renderWithClient(mx, <KeyBackupNudge />);
        await settle(50);
        expect(bodyText()).toBe('');
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
    });

    it('renders nothing once this device has an active backup', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: '3', masterKey: true });
        const mx = createFakeKeyClient(hs);
        stubCrypto(mx, { crossSigningReady: true, activeBackupVersion: '3' });
        mounted = await renderWithClient(mx, <KeyBackupNudge />);
        await waitFor(() => hs.calls.some((c) => c.path.endsWith('/room_keys/version')), {
            what: 'the backup check',
        });
        await settle(20);
        expect(bodyText()).toBe('');
    });

    it('no verdict promises a recovery Blackout cannot do', () => {
        for (const text of Object.values(KEY_BACKUP_NUDGE_TEXT)) {
            expect(text.detail).not.toMatch(
                /recover(ed|able)? when you sign in on a new device|don.t lose access/i
            );
        }
    });
});

describe('KeyBackupNudge: the click re-asks the homeserver, because the banner can be stale', () => {
    // Round 2 of S9. Nothing tells this device when another device of the
    // account sets up cross-signing and a backup: the SDK emits
    // KeyBackupStatus only for this device's own backup. So a "Set up backup"
    // the banner showed an hour ago must not open the from-scratch setup from
    // that stored answer.

    it('cross-signing and a backup created on another device after the check: the click shows the backup text, never the setup, and the banner follows', async () => {
        const { hs, crypto } = await renderNudge(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.none.headline
        );
        const before = backupVersionGets(hs.calls);
        // Another device of the account sets things up while the banner sits open.
        hs.setBackupVersion('3');
        hs.setMasterKey(true);
        await settle(50);
        // The banner is stale: it still offers the action.
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(1);

        await click(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)[0]);
        await waitFor(() => buttonsNamed('Close').length === 1, { what: 'the explanation' });
        expect(backupVersionGets(hs.calls)).toBeGreaterThan(before);
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.backup.detail);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(bodyText()).not.toContain(RESET_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(hs.destructiveCalls()).toEqual([]);
        // The banner shows the fresh row: no action any more.
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.backup.headline);
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);

        await click(buttonsNamed('Close')[0]);
        await waitFor(() => buttonsNamed('Close').length === 0, {
            what: 'the explanation to close',
        });
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.backup.headline);
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
    });

    it('cross-signing created on another device after the check, no backup: the not-verified text, no setup, no reset', async () => {
        const { hs, crypto } = await renderNudge(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.none.headline
        );
        hs.setMasterKey(true);
        await click(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)[0]);
        await waitFor(() => buttonsNamed('Close').length === 1, { what: 'the explanation' });
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.crossSigningNotReady.detail);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(bodyText()).not.toContain(RESET_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
    });

    it('the reset row goes stale too: a backup created after the check means the click shows the backup text, not the reset', async () => {
        const { hs, crypto } = await renderNudge(
            { backupVersion: null, masterKey: true },
            { crossSigningReady: true },
            KEY_BACKUP_NUDGE_TEXT.crossSigningReady.headline
        );
        hs.setBackupVersion('3');
        await click(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)[0]);
        await waitFor(() => buttonsNamed('Close').length === 1, { what: 'the explanation' });
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.backup.detail);
        expect(bodyText()).not.toContain(RESET_HEADING);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
    });

    it('the homeserver stops answering between the check and the click: the unknown text, no setup', async () => {
        const { hs, crypto } = await renderNudge(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.none.headline
        );
        hs.setBackupAnswer({ kind: 'reject' });
        await click(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)[0]);
        await waitFor(() => buttonsNamed('Close').length === 1, { what: 'the explanation' });
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.unknown.detail);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
    });

    it('nothing on the server at the click either: the fresh answer opens the setup, with one more check', async () => {
        const { hs } = await renderNudge(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.none.headline
        );
        const before = backupVersionGets(hs.calls);
        await click(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)[0]);
        await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
        expect(backupVersionGets(hs.calls)).toBe(before + 1);
    });
});

describe('KeyBackupNudge: a device check that rejects', () => {
    it('at the click: the unknown text, no setup, no rejection escapes', async () => {
        const { crypto } = await renderNudge(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.none.headline
        );
        crypto.isCrossSigningReady.mockRejectedValue(new Error('crypto not ready'));
        const unhandled = await unhandledRejectionsDuring(async () => {
            await click(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)[0]);
            await waitFor(() => buttonsNamed('Close').length === 1, { what: 'the explanation' });
        });
        expect(unhandled).toEqual([]);
        expect(bodyText()).toContain(KEY_BACKUP_NUDGE_TEXT.unknown.detail);
        expect(bodyText()).not.toContain(SETUP_HEADING);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
    });

    it('at mount: renders nothing, warns once, and lets no rejection escape', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const mx = createFakeKeyClient(hs);
        const crypto = stubCrypto(mx, { crossSigningReady: false });
        crypto.isCrossSigningReady.mockRejectedValue(new Error('crypto not ready'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const unhandled = await unhandledRejectionsDuring(async () => {
            mounted = await renderWithClient(mx, <KeyBackupNudge />);
            await waitFor(() => hs.calls.some((c) => c.path.endsWith('/keys/query')), {
                what: 'the account check',
            });
            await settle(100);
        });

        expect(unhandled).toEqual([]);
        expect(bodyText()).toBe('');
        expect(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)).toHaveLength(0);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});

describe('KeyBackupNudge: the overlay outlives the banner', () => {
    it('the recovery key stays on screen when this device’s backup becomes active during the setup', async () => {
        const { crypto, mx } = await renderNudge(
            { backupVersion: null, masterKey: false },
            { crossSigningReady: false },
            KEY_BACKUP_NUDGE_TEXT.none.headline
        );
        // As the SDK does once the new backup is enabled: from then on this
        // device has an active backup, and KeyBackupStatus fires, which makes
        // the nudge refresh and hide its banner.
        crypto.resetKeyBackup.mockImplementation(async () => {
            crypto.getActiveSessionBackupVersion.mockResolvedValue('1');
            mx.emit(CryptoEvent.KeyBackupStatus, true);
        });

        await click(buttonsNamed(KEY_BACKUP_NUDGE_ACTION_LABEL)[0]);
        await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
        await submitForm(document.body.querySelector('form') as HTMLFormElement);

        await waitFor(() => !bodyText().includes(KEY_BACKUP_NUDGE_TEXT.none.headline), {
            what: 'the banner to hide',
        });
        expect(buttonsNamed('Not now')).toHaveLength(0);
        // The person has not closed the dialog: the recovery key is still there to copy.
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the recovery key screen',
        });
        await settle(50);
        expect(bodyText()).toContain(RECOVERY_KEY_SCREEN);
    });
});
