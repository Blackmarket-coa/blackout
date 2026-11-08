// @vitest-environment jsdom
//
// The setup form's own last check (`SetupVerification`, round 2 of S9,
// `docs/security/key-backup-nudge-2026-11-02.md`). Whatever opened it, the
// form asks the homeserver again right before its first write and refuses
// with a true message unless the answer is "nothing to replace" (or, for the
// warned reset, "no backup"). This closes the window between an entry's
// click-time check and the submit, in which another device of the account can
// create cross-signing and a backup. Stubbed crypto: the three setup calls
// resolve at once and are counted; the fake homeserver lists its writes.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Folds overlays wrap their content in focus-trap-react, which in jsdom finds
// no tabbable node (no layout) and throws. The existing overlay tests render it
// as a pass-through for the same reason.
vi.mock('focus-trap-react', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import {
    DeviceVerificationReset,
    DeviceVerificationSetup,
} from '../../../src/app/components/DeviceVerificationSetup';
import { SETUP_REFUSED_TEXT } from '../../../src/client/keyBackupCheck';
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
    stubCrypto,
    submitForm,
    waitFor,
    type CryptoStubOptions,
} from '../helpers/keyBackupRender';
import type { MountedDialog } from '../helpers/modalReliability';

const SETUP_HEADING = 'Setup Device Verification';
const RESET_HEADING = 'Reset Device Verification';
const RECOVERY_KEY_SCREEN = 'Store the Recovery Key in a safe place';

let mounted: MountedDialog | undefined;

const renderSetup = async (
    server: FakeKeyHomeserverOptions,
    device: CryptoStubOptions = { crossSigningReady: false }
) => {
    const hs = createFakeKeyHomeserver(server);
    const mx = createFakeKeyClient(hs);
    const crypto = stubCrypto(mx, device);
    mounted = await renderWithClient(mx, <DeviceVerificationSetup onCancel={() => undefined} />);
    await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
    return { hs, mx, crypto };
};

const renderReset = async (
    server: FakeKeyHomeserverOptions,
    device: CryptoStubOptions = { crossSigningReady: true }
) => {
    const hs = createFakeKeyHomeserver(server);
    const mx = createFakeKeyClient(hs);
    const crypto = stubCrypto(mx, device);
    mounted = await renderWithClient(mx, <DeviceVerificationReset onCancel={() => undefined} />);
    await waitFor(() => bodyText().includes(RESET_HEADING), { what: 'the reset dialog' });
    // The warning and confirm step, as today.
    expect(bodyText()).toContain('Resetting device verification is permanent.');
    await click(buttonsNamed('Reset')[0]);
    await waitFor(() => document.body.querySelector('form') !== null, { what: 'the setup form' });
    return { hs, mx, crypto };
};

const submit = async () => {
    const form = document.body.querySelector('form');
    expect(form).not.toBeNull();
    await submitForm(form as HTMLFormElement);
};

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
});

describe('SetupVerification: the check before the first write, from-scratch setup', () => {
    it('the account has a backup: refuses with the backup text and writes nothing', async () => {
        const { hs, crypto } = await renderSetup({ backupVersion: '3', masterKey: false });
        await submit();
        await waitFor(() => bodyText().includes(SETUP_REFUSED_TEXT.backup), {
            what: 'the refusal',
        });
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(hs.destructiveCalls()).toEqual([]);
        expect(hs.backupVersion()).toBe('3');
        expect(bodyText()).not.toContain(RECOVERY_KEY_SCREEN);
    });

    it('the server has a master key: refuses with the cross-signing text and writes nothing', async () => {
        const { hs, crypto } = await renderSetup({ backupVersion: null, masterKey: true });
        await submit();
        await waitFor(() => bodyText().includes(SETUP_REFUSED_TEXT.crossSigning), {
            what: 'the refusal',
        });
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(hs.destructiveCalls()).toEqual([]);
        expect(bodyText()).not.toContain(RECOVERY_KEY_SCREEN);
    });

    it('the backup check fails: refuses with the unknown text and writes nothing', async () => {
        const { hs, crypto } = await renderSetup({
            backupAnswer: { kind: 'reject' },
            masterKey: false,
        });
        await submit();
        await waitFor(() => bodyText().includes(SETUP_REFUSED_TEXT.unknown), {
            what: 'the refusal',
        });
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(hs.destructiveCalls()).toEqual([]);
    });

    it('the cross-signing check fails while the backup check answered none: refuses with the unknown text', async () => {
        const { crypto } = await renderSetup({
            backupVersion: null,
            keysQueryAnswer: {
                kind: 'json',
                status: 500,
                body: { errcode: 'M_UNKNOWN', error: 'Internal server error' },
            },
        });
        await submit();
        await waitFor(() => bodyText().includes(SETUP_REFUSED_TEXT.unknown), {
            what: 'the refusal',
        });
        expect(destructiveCryptoCalls(crypto)).toBe(0);
    });

    it('nothing on the server: goes on, the three calls run, the recovery key shows', async () => {
        const { crypto } = await renderSetup({ backupVersion: null, masterKey: false });
        await submit();
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the recovery key screen',
        });
        expect(destructiveCryptoCalls(crypto)).toBe(3);
        expect(crypto.bootstrapSecretStorage).toHaveBeenCalledWith(
            expect.objectContaining({ setupNewSecretStorage: true })
        );
        expect(crypto.bootstrapCrossSigning).toHaveBeenCalledWith(
            expect.objectContaining({ setupNewCrossSigning: true })
        );
    });

    it('checks at the submit, not when the form opened: a backup created in between is refused', async () => {
        const { hs, crypto } = await renderSetup({ backupVersion: null, masterKey: false });
        const before = backupVersionGets(hs.calls);
        // Between the click that opened the form and the submit, another
        // device of the account set up cross-signing and a backup.
        hs.setBackupVersion('3');
        hs.setMasterKey(true);
        await submit();
        await waitFor(() => bodyText().includes(SETUP_REFUSED_TEXT.backup), {
            what: 'the refusal',
        });
        expect(backupVersionGets(hs.calls)).toBe(before + 1);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(hs.destructiveCalls()).toEqual([]);
        expect(hs.backupVersion()).toBe('3');
    });
});

describe('SetupVerification in the warned reset', () => {
    it('cross-signing on the server, no backup: goes on (the reset replaces cross-signing on purpose)', async () => {
        const { crypto } = await renderReset({ backupVersion: null, masterKey: true });
        await submit();
        await waitFor(() => bodyText().includes(RECOVERY_KEY_SCREEN), {
            what: 'the recovery key screen',
        });
        expect(destructiveCryptoCalls(crypto)).toBe(3);
    });

    it('a backup exists: refuses with the backup text and writes nothing', async () => {
        const { hs, crypto } = await renderReset({ backupVersion: '3', masterKey: true });
        await submit();
        await waitFor(() => bodyText().includes(SETUP_REFUSED_TEXT.backup), {
            what: 'the refusal',
        });
        expect(destructiveCryptoCalls(crypto)).toBe(0);
        expect(hs.destructiveCalls()).toEqual([]);
        expect(hs.backupVersion()).toBe('3');
    });

    it('the backup check fails: refuses with the unknown text and writes nothing', async () => {
        const { crypto } = await renderReset({ backupAnswer: { kind: 'reject' }, masterKey: true });
        await submit();
        await waitFor(() => bodyText().includes(SETUP_REFUSED_TEXT.unknown), {
            what: 'the refusal',
        });
        expect(destructiveCryptoCalls(crypto)).toBe(0);
    });
});
