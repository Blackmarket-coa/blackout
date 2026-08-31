import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api';
import {
    formatEncryptionHealth,
    getEncryptionHealthSnapshot,
    resetEncryptionHealthForTests,
    startEncryptionHealthTracking,
    stopEncryptionHealthTracking,
} from '../../../src/client/encryptionHealth';

/**
 * BO-1 root-cause classifier. The tracker mirrors matrixLogger's module-level
 * pattern: async CryptoApi state is folded into a snapshot the synchronous
 * diagnostics collector can read. These tests pin the classification states,
 * the fail-open per-field 'unknown's, and the logout reset.
 */

interface FakeCrypto {
    getKeyBackupInfo: ReturnType<typeof vi.fn>;
    isKeyBackupTrusted: ReturnType<typeof vi.fn>;
    getActiveSessionBackupVersion: ReturnType<typeof vi.fn>;
    getSessionBackupPrivateKey: ReturnType<typeof vi.fn>;
    isCrossSigningReady: ReturnType<typeof vi.fn>;
}

const healthyCrypto = (): FakeCrypto => ({
    getKeyBackupInfo: vi.fn(async () => ({ version: '3' })),
    isKeyBackupTrusted: vi.fn(async () => ({ trusted: true })),
    getActiveSessionBackupVersion: vi.fn(async () => '3'),
    getSessionBackupPrivateKey: vi.fn(async () => new Uint8Array([1])),
    isCrossSigningReady: vi.fn(async () => true),
});

const makeClient = (crypto: FakeCrypto | null) => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const mx = {
        getCrypto: () => crypto,
        on: (event: string, fn: (...args: unknown[]) => void) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)?.add(fn);
            return mx;
        },
        removeListener: (event: string, fn: (...args: unknown[]) => void) => {
            listeners.get(event)?.delete(fn);
            return mx;
        },
    };
    const emit = (event: string, ...args: unknown[]) => {
        listeners.get(event)?.forEach((fn) => fn(...args));
    };
    const listenerCount = (event: string) => listeners.get(event)?.size ?? 0;
    return { mx: mx as unknown as MatrixClient, emit, listenerCount };
};

const settle = async () => {
    // The initial refresh is fire-and-forget; let its promise chain drain.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => {
    resetEncryptionHealthForTests();
});

describe('encryption health tracking', () => {
    it('starts unsampled before any client boots', () => {
        expect(getEncryptionHealthSnapshot()).toEqual({
            serverBackup: 'unknown',
            backupTrusted: 'unknown',
            activeBackup: 'unknown',
            decryptionKeyCached: 'unknown',
            crossSigningReady: 'unknown',
            backupFailures: 0,
            sampled: false,
        });
    });

    it('samples a healthy device as all-yes', async () => {
        const { mx } = makeClient(healthyCrypto());
        startEncryptionHealthTracking(mx);
        await settle();

        expect(getEncryptionHealthSnapshot()).toEqual({
            serverBackup: 'yes',
            backupTrusted: 'yes',
            activeBackup: 'yes',
            decryptionKeyCached: 'yes',
            crossSigningReady: 'yes',
            backupFailures: 0,
            sampled: true,
        });
    });

    it('classifies "backup never set up": no server backup, nothing trusted', async () => {
        const crypto = healthyCrypto();
        crypto.getKeyBackupInfo.mockResolvedValue(null);
        crypto.getActiveSessionBackupVersion.mockResolvedValue(null);
        crypto.getSessionBackupPrivateKey.mockResolvedValue(null);
        const { mx } = makeClient(crypto);
        startEncryptionHealthTracking(mx);
        await settle();

        const s = getEncryptionHealthSnapshot();
        expect(s.serverBackup).toBe('no');
        expect(s.backupTrusted).toBe('no');
        expect(s.activeBackup).toBe('no');
        expect(s.decryptionKeyCached).toBe('no');
        // isKeyBackupTrusted must not be probed without a backup info dict.
        expect(crypto.isKeyBackupTrusted).not.toHaveBeenCalled();
    });

    it('classifies "restore failing": backup exists but key not cached, failures counted', async () => {
        const crypto = healthyCrypto();
        crypto.getSessionBackupPrivateKey.mockResolvedValue(null);
        crypto.getActiveSessionBackupVersion.mockResolvedValue(null);
        const { mx, emit } = makeClient(crypto);
        startEncryptionHealthTracking(mx);
        await settle();

        emit(CryptoEvent.KeyBackupFailed, 'M_NOT_FOUND');
        emit(CryptoEvent.KeyBackupFailed, 'M_NOT_FOUND');
        await settle();

        const s = getEncryptionHealthSnapshot();
        expect(s.serverBackup).toBe('yes');
        expect(s.decryptionKeyCached).toBe('no');
        expect(s.activeBackup).toBe('no');
        expect(s.backupFailures).toBe(2);
    });

    it('marks only the failing field unknown when one API throws', async () => {
        const crypto = healthyCrypto();
        crypto.isCrossSigningReady.mockRejectedValue(new Error('wasm not ready'));
        const { mx } = makeClient(crypto);
        startEncryptionHealthTracking(mx);
        await settle();

        const s = getEncryptionHealthSnapshot();
        expect(s.crossSigningReady).toBe('unknown');
        expect(s.serverBackup).toBe('yes');
        expect(s.sampled).toBe(true);
    });

    it('re-samples when the backup status changes', async () => {
        const crypto = healthyCrypto();
        crypto.getActiveSessionBackupVersion.mockResolvedValue(null);
        const { mx, emit } = makeClient(crypto);
        startEncryptionHealthTracking(mx);
        await settle();
        expect(getEncryptionHealthSnapshot().activeBackup).toBe('no');

        crypto.getActiveSessionBackupVersion.mockResolvedValue('4');
        emit(CryptoEvent.KeyBackupStatus, true);
        await settle();
        expect(getEncryptionHealthSnapshot().activeBackup).toBe('yes');
    });

    it('resets to unsampled on stop and detaches listeners', async () => {
        const crypto = healthyCrypto();
        const { mx, emit, listenerCount } = makeClient(crypto);
        startEncryptionHealthTracking(mx);
        await settle();
        expect(getEncryptionHealthSnapshot().sampled).toBe(true);

        stopEncryptionHealthTracking(mx);
        expect(getEncryptionHealthSnapshot().sampled).toBe(false);
        expect(listenerCount(CryptoEvent.KeyBackupFailed)).toBe(0);

        emit(CryptoEvent.KeyBackupFailed, 'M_NOT_FOUND');
        await settle();
        expect(getEncryptionHealthSnapshot().backupFailures).toBe(0);
    });

    it('ignores a stop for a client that is not the tracked one', async () => {
        const { mx } = makeClient(healthyCrypto());
        const { mx: other } = makeClient(healthyCrypto());
        startEncryptionHealthTracking(mx);
        await settle();

        stopEncryptionHealthTracking(other);
        expect(getEncryptionHealthSnapshot().sampled).toBe(true);

        stopEncryptionHealthTracking(null);
        expect(getEncryptionHealthSnapshot().sampled).toBe(true);
    });

    it('does not let a stale in-flight refresh overwrite the reset state', async () => {
        const crypto = healthyCrypto();
        let release: (() => void) | undefined;
        crypto.isCrossSigningReady.mockImplementation(
            () =>
                new Promise((resolve) => {
                    release = () => resolve(true);
                })
        );
        const { mx } = makeClient(crypto);
        startEncryptionHealthTracking(mx);
        await settle();

        stopEncryptionHealthTracking(mx);
        release?.();
        await settle();

        expect(getEncryptionHealthSnapshot().sampled).toBe(false);
    });

    it('carries no identifiers — tristates, counts, and flags only', async () => {
        const { mx } = makeClient(healthyCrypto());
        startEncryptionHealthTracking(mx);
        await settle();

        const s = getEncryptionHealthSnapshot();
        expect(Object.keys(s).sort()).toEqual([
            'activeBackup',
            'backupFailures',
            'backupTrusted',
            'crossSigningReady',
            'decryptionKeyCached',
            'sampled',
            'serverBackup',
        ]);
        for (const value of Object.values(s)) {
            expect(
                ['yes', 'no', 'unknown', true, false].includes(value as never) ||
                    typeof value === 'number'
            ).toBe(true);
        }
    });
});

describe('formatEncryptionHealth', () => {
    it('renders "unsampled" when the client never booted', () => {
        expect(
            formatEncryptionHealth({
                serverBackup: 'unknown',
                backupTrusted: 'unknown',
                activeBackup: 'unknown',
                decryptionKeyCached: 'unknown',
                crossSigningReady: 'unknown',
                backupFailures: 0,
                sampled: false,
            })
        ).toBe('unsampled');
    });

    it('renders the one-line posture for a sampled device', () => {
        expect(
            formatEncryptionHealth({
                serverBackup: 'yes',
                backupTrusted: 'no',
                activeBackup: 'no',
                decryptionKeyCached: 'no',
                crossSigningReady: 'yes',
                backupFailures: 2,
                sampled: true,
            })
        ).toBe('backup=yes trusted=no active=no key_cached=no cross_signing=yes failures=2');
    });
});
