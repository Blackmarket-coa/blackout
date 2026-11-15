// @vitest-environment jsdom
//
// The legacy Devices page's "Enable" button (`EnableVerification`), the third
// entry that opens the from-scratch `DeviceVerificationSetup`. Its `visible`
// prop comes from account data (`useCrossSigningActive`), which never says
// whether a backup exists; the button must render only once the homeserver
// answered that the account has neither (S9,
// `docs/security/key-backup-nudge-2026-11-02.md`). The page is not mounted in
// the shipped app today.
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
    ENABLE_VERIFICATION_GUARD_TEXTS,
    EnableVerification,
} from '../../../../../src/app/features/settings/devices/Verification';
import { KEY_BACKUP_NUDGE_TEXT } from '../../../../../src/app/features/settings/security/encryptionPosture';
import {
    createFakeKeyClient,
    createFakeKeyHomeserver,
    type FakeKeyHomeserverOptions,
} from '../../../helpers/fakeKeyHomeserver';
import {
    backupVersionGets,
    bodyText,
    buttonsNamed,
    click,
    destructiveCryptoCalls,
    renderWithClient,
    settle,
    stubCrypto,
    unhandledRejectionsDuring,
    waitFor,
} from '../../../helpers/keyBackupRender';
import type { MountedDialog } from '../../../helpers/modalReliability';

let mounted: MountedDialog | undefined;

const renderEnable = async (server: FakeKeyHomeserverOptions, visible = true) => {
    const hs = createFakeKeyHomeserver(server);
    const mx = createFakeKeyClient(hs);
    stubCrypto(mx, { crossSigningReady: false });
    mounted = await renderWithClient(mx, <EnableVerification visible={visible} />);
    await waitFor(() => hs.calls.some((c) => c.path.endsWith('/keys/query')) || !visible, {
        what: 'the account check',
    });
    await settle(20);
    return hs;
};

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
});

describe('EnableVerification', () => {
    it('offers Enable only when the homeserver answered no backup and no master key', async () => {
        await renderEnable({ backupVersion: null, masterKey: false });
        const enable = buttonsNamed('Enable');
        expect(enable).toHaveLength(1);
        await click(enable[0]);
        await waitFor(() => bodyText().includes('Setup Device Verification'), {
            what: 'the setup dialog',
        });
    });

    it('offers nothing when the account has a backup (account data says no cross-signing)', async () => {
        await renderEnable({ backupVersion: '3', masterKey: false });
        expect(buttonsNamed('Enable')).toHaveLength(0);
    });

    it('offers nothing when the backup check failed', async () => {
        await renderEnable({ backupAnswer: { kind: 'reject' }, masterKey: false });
        expect(buttonsNamed('Enable')).toHaveLength(0);
    });

    it('offers nothing when the server has a master key, whatever account data said', async () => {
        await renderEnable({ backupVersion: null, masterKey: true });
        expect(buttonsNamed('Enable')).toHaveLength(0);
    });

    it('renders nothing and asks nothing when not visible', async () => {
        const hs = await renderEnable({ backupVersion: null, masterKey: false }, false);
        expect(buttonsNamed('Enable')).toHaveLength(0);
        expect(hs.calls).toEqual([]);
    });
});

describe('EnableVerification: the click re-asks the homeserver, because the answer can be stale', () => {
    it('cross-signing and a backup created on another device after the check: the backup text, not the setup, and the button goes', async () => {
        const hs = await renderEnable({ backupVersion: null, masterKey: false });
        expect(buttonsNamed('Enable')).toHaveLength(1);
        const before = backupVersionGets(hs.calls);
        hs.setBackupVersion('3');
        hs.setMasterKey(true);
        await settle(50);

        await click(buttonsNamed('Enable')[0]);
        await waitFor(() => buttonsNamed('Close').length === 1, { what: 'the explanation' });
        expect(backupVersionGets(hs.calls)).toBeGreaterThan(before);
        expect(bodyText()).toContain(ENABLE_VERIFICATION_GUARD_TEXTS.backup);
        expect(bodyText()).not.toContain('Setup Device Verification');
        expect(hs.destructiveCalls()).toEqual([]);
        expect(buttonsNamed('Enable')).toHaveLength(0);

        await click(buttonsNamed('Close')[0]);
        await waitFor(() => buttonsNamed('Close').length === 0, {
            what: 'the explanation to close',
        });
        expect(buttonsNamed('Enable')).toHaveLength(0);
    });

    it('nothing on the server at the click either: the fresh answer opens the setup', async () => {
        const hs = await renderEnable({ backupVersion: null, masterKey: false });
        const before = backupVersionGets(hs.calls);
        await click(buttonsNamed('Enable')[0]);
        await waitFor(() => bodyText().includes('Setup Device Verification'), {
            what: 'the setup dialog',
        });
        expect(backupVersionGets(hs.calls)).toBe(before + 1);
    });

    it('close during the check, a backup appears, click again: the late "none" brings back neither the setup nor Enable', async () => {
        // Round 3 of S9: an answer to an earlier click is dropped.
        const hs = await renderEnable({ backupVersion: null, masterKey: false });
        const release = hs.delayNextBackupAnswer();
        await click(buttonsNamed('Enable')[0]);
        await settle(20);
        await click(buttonsNamed('Close')[0]);
        hs.setBackupVersion('3');
        hs.setMasterKey(true);
        await click(buttonsNamed('Enable')[0]);
        await waitFor(() => bodyText().includes(ENABLE_VERIFICATION_GUARD_TEXTS.backup), {
            what: 'the backup text',
        });
        await click(buttonsNamed('Close')[0]);
        await settle(20);
        expect(buttonsNamed('Enable')).toHaveLength(0);

        release();
        await settle(50);
        expect(buttonsNamed('Enable')).toHaveLength(0);
        expect(bodyText()).not.toContain('Setup Device Verification');
        expect(hs.destructiveCalls()).toEqual([]);
    });

    it('a device check that rejects: no Enable, no setup, no rejection escapes', async () => {
        const hs = createFakeKeyHomeserver({ backupVersion: null, masterKey: false });
        const mx = createFakeKeyClient(hs);
        const crypto = stubCrypto(mx, { crossSigningReady: false });
        crypto.isCrossSigningReady.mockRejectedValue(new Error('crypto not ready'));

        const unhandled = await unhandledRejectionsDuring(async () => {
            mounted = await renderWithClient(mx, <EnableVerification visible />);
            await waitFor(() => hs.calls.some((c) => c.path.endsWith('/keys/query')), {
                what: 'the account check',
            });
            await settle(100);
        });

        expect(unhandled).toEqual([]);
        expect(buttonsNamed('Enable')).toHaveLength(0);
        expect(destructiveCryptoCalls(crypto)).toBe(0);
    });
});

describe('EnableVerification: its own texts', () => {
    it('say only what the check found, nothing about which screens Blackout has', () => {
        // The page it sits on renders "Verify Manually" and the backup
        // restore tile, so the nudge's "Blackout has no screen that …" would
        // be false here.
        for (const text of Object.values(ENABLE_VERIFICATION_GUARD_TEXTS)) {
            if (typeof text === 'string') expect(text).not.toMatch(/no screen/i);
        }
        expect(ENABLE_VERIFICATION_GUARD_TEXTS.offer).toBeUndefined();
        expect(ENABLE_VERIFICATION_GUARD_TEXTS.check_failed).toBe(
            KEY_BACKUP_NUDGE_TEXT.unknown.detail
        );
        expect(ENABLE_VERIFICATION_GUARD_TEXTS.backup).toMatch(/would delete it/);
        expect(ENABLE_VERIFICATION_GUARD_TEXTS.not_verified).toMatch(
            /would replace your cross-signing/
        );
    });

    it('a master key on the server at the click: the not-verified text', async () => {
        const hs = await renderEnable({ backupVersion: null, masterKey: false });
        hs.setMasterKey(true);
        await click(buttonsNamed('Enable')[0]);
        await waitFor(() => bodyText().includes(ENABLE_VERIFICATION_GUARD_TEXTS.not_verified), {
            what: 'the not-verified text',
        });
        expect(bodyText()).not.toContain('Setup Device Verification');
    });
});
