import { describe, expect, it } from 'vitest';
import {
    KEY_BACKUP_NUDGE_TEXT,
    selectKeyBackupNudge,
} from '../../../../../src/app/features/settings/security/encryptionPosture';

describe('selectKeyBackupNudge', () => {
    it('nudges when encryption is not set up and there is no backup', () => {
        const v = selectKeyBackupNudge({
            crossSigningReady: false,
            keyBackupReady: false,
            accountState: 'none',
        });
        expect(v).not.toBeNull();
        expect(v?.severity).toBe('warn');
        expect(v?.actions[0].id).toBe('enable_key_backup');
        expect(v?.headline).toMatch(/backup/i);
    });

    it('stays silent once a key backup exists', () => {
        expect(
            selectKeyBackupNudge({
                crossSigningReady: false,
                keyBackupReady: true,
                accountState: 'none',
            })
        ).toBeNull();
        expect(
            selectKeyBackupNudge({
                crossSigningReady: true,
                keyBackupReady: true,
                accountState: 'cross_signing',
            })
        ).toBeNull();
    });

    it('nudges cross-signed accounts that have no backup', () => {
        // Cross-signed but no backup is exactly the population that hits
        // "no key backup on the server" decryption failures, so the nudge
        // must show. The consumer routes this case through the
        // explicitly-confirmed DeviceVerificationReset flow (never the
        // silent from-scratch bootstrap), and the detail copy says so.
        const v = selectKeyBackupNudge({
            crossSigningReady: true,
            keyBackupReady: false,
            accountState: 'cross_signing',
        });
        expect(v).not.toBeNull();
        expect(v?.severity).toBe('warn');
        expect(v?.actions[0].id).toBe('enable_key_backup');
        expect(v?.detail).toMatch(/resets device verification/i);
    });

    // S9 (docs/security/key-backup-nudge-2026-11-02.md): the account's state on
    // the homeserver decides whether any action is offered. These three rows
    // offer none, because the from-scratch setup deletes an existing backup and
    // replaces the account's cross-signing.
    it('offers no action on an unverified device of a cross-signed account', () => {
        const v = selectKeyBackupNudge({
            crossSigningReady: false,
            keyBackupReady: false,
            accountState: 'cross_signing',
        });
        expect(v?.actions).toEqual([]);
        expect(v?.headline).toBe(KEY_BACKUP_NUDGE_TEXT.crossSigningNotReady.headline);
    });

    it('offers no action when the account has a backup this device cannot use', () => {
        const v = selectKeyBackupNudge({
            crossSigningReady: false,
            keyBackupReady: false,
            accountState: 'backup',
        });
        expect(v?.actions).toEqual([]);
        expect(v?.headline).toBe(KEY_BACKUP_NUDGE_TEXT.backup.headline);
    });

    it('offers no action when the check failed', () => {
        const v = selectKeyBackupNudge({
            crossSigningReady: false,
            keyBackupReady: false,
            accountState: 'unknown',
        });
        expect(v?.actions).toEqual([]);
        expect(v?.detail).toBe(KEY_BACKUP_NUDGE_TEXT.unknown.detail);
    });
});
