import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncryptionHealthSnapshot } from '../../src/client/encryptionHealth';

/**
 * BO-1 classifier reaching a report.
 *
 * Companion to diagnosticsSuppressedCounts.test.ts: the UTD count says how
 * often a device cannot read history; the encryption-health snapshot says
 * which of the three suspected causes it is in. Both report surfaces are
 * pinned because they collect differently — the settings form forwards the
 * whole `CollectedDiagnostics` object, while the widget copies named fields
 * and would silently drop a new one.
 */

const getSuppressedLogCounts = vi.fn();
const getEncryptionHealthSnapshot = vi.fn();

vi.mock('../../src/client/matrixLogger', () => ({
    getSuppressedLogCounts: () => getSuppressedLogCounts(),
}));

vi.mock('../../src/client/encryptionHealth', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../src/client/encryptionHealth')>();
    return {
        ...original,
        getEncryptionHealthSnapshot: () => getEncryptionHealthSnapshot(),
    };
});

const { collectDiagnostics } = await import('../../src/app/lib/diagnostics/collect');
const { collectWidgetMetadata } = await import(
    '../../src/app/features/bug-widget/widgetReportState'
);

const brokenRestore: EncryptionHealthSnapshot = {
    serverBackup: 'yes',
    backupTrusted: 'yes',
    activeBackup: 'no',
    decryptionKeyCached: 'no',
    crossSigningReady: 'yes',
    backupFailures: 3,
    sampled: true,
};

describe('encryption health in diagnostics', () => {
    beforeEach(() => {
        getSuppressedLogCounts.mockReset();
        getSuppressedLogCounts.mockReturnValue({
            pushRule: 0,
            keyBackupProbe: 4,
            decryptUtd: 17,
        });
        getEncryptionHealthSnapshot.mockReset();
        getEncryptionHealthSnapshot.mockReturnValue(brokenRestore);
    });

    it('carries the snapshot on the settings-page diagnostics', () => {
        expect(collectDiagnostics().encryptionHealth).toEqual(brokenRestore);
    });

    it('does not throw if the tracker is unavailable, and reads unsampled', () => {
        getEncryptionHealthSnapshot.mockImplementation(() => {
            throw new Error('no client');
        });

        expect(() => collectDiagnostics()).not.toThrow();
        expect(collectDiagnostics().encryptionHealth).toEqual({
            serverBackup: 'unknown',
            backupTrusted: 'unknown',
            activeBackup: 'unknown',
            decryptionKeyCached: 'unknown',
            crossSigningReady: 'unknown',
            backupFailures: 0,
            sampled: false,
        });
    });

    it('attaches the one-line posture to a widget report alongside the UTD count', () => {
        const meta = collectWidgetMetadata();
        expect(meta.undecryptableEvents).toBe(17);
        expect(meta.encryptionHealth).toBe(
            'backup=yes trusted=yes active=no key_cached=no cross_signing=yes failures=3'
        );
    });

    it('omits the posture line on a device with no undecryptable events', () => {
        getSuppressedLogCounts.mockReturnValue({
            pushRule: 2,
            keyBackupProbe: 0,
            decryptUtd: 0,
        });

        const meta = collectWidgetMetadata();
        expect(meta).not.toHaveProperty('undecryptableEvents');
        expect(meta).not.toHaveProperty('encryptionHealth');
    });

    it('renders "unsampled" on the widget when the client never booted', () => {
        getEncryptionHealthSnapshot.mockReturnValue({
            serverBackup: 'unknown',
            backupTrusted: 'unknown',
            activeBackup: 'unknown',
            decryptionKeyCached: 'unknown',
            crossSigningReady: 'unknown',
            backupFailures: 0,
            sampled: false,
        });

        const meta = collectWidgetMetadata();
        expect(meta.encryptionHealth).toBe('unsampled');
    });
});
