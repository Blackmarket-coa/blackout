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
    CHIP_TEXT,
    MessageBadEncryptedContent,
} from '../../../src/app/components/message/content/FallbackContent';
import {
    createFakeKeyClient,
    createFakeKeyHomeserver,
    type FakeKeyHomeserverOptions,
} from '../helpers/fakeKeyHomeserver';
import {
    bodyText,
    buttonsNamed,
    click,
    destructiveCryptoCalls,
    renderWithClient,
    stubCrypto,
    unhandledRejectionsDuring,
    waitFor,
    type CryptoStubOptions,
} from '../helpers/keyBackupRender';
import type { MountedDialog } from '../helpers/modalReliability';

const SETUP_HEADING = 'Setup Device Verification';
const RESET_HEADING = 'Reset Device Verification';

let mounted: MountedDialog | undefined;

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

    it('nothing on the server: opens the from-scratch setup', async () => {
        await renderChip({ backupVersion: null, masterKey: false }, { crossSigningReady: false });
        await clickWhy();
        await waitFor(() => bodyText().includes(SETUP_HEADING), { what: 'the setup dialog' });
    });

    it('cross-signing this device trusts, no backup: opens the warned reset', async () => {
        await renderChip({ backupVersion: null, masterKey: true }, { crossSigningReady: true });
        await clickWhy();
        await waitFor(() => bodyText().includes(RESET_HEADING), { what: 'the reset dialog' });
        expect(bodyText()).toContain('Resetting device verification is permanent.');
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
});
