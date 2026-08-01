import { describe, expect, it } from 'vitest';
import { selectKeyBackupNudge } from '../../../../../src/app/features/settings/security/encryptionPosture';

describe('selectKeyBackupNudge', () => {
    it('nudges when encryption is not set up and there is no backup', () => {
        const v = selectKeyBackupNudge({ crossSigningReady: false, keyBackupReady: false });
        expect(v).not.toBeNull();
        expect(v?.severity).toBe('warn');
        expect(v?.actions[0].id).toBe('enable_key_backup');
        expect(v?.headline).toMatch(/backup/i);
    });

    it('stays silent once a key backup exists', () => {
        expect(selectKeyBackupNudge({ crossSigningReady: false, keyBackupReady: true })).toBeNull();
        expect(selectKeyBackupNudge({ crossSigningReady: true, keyBackupReady: true })).toBeNull();
    });

    it('nudges cross-signed accounts that have no backup', () => {
        // Cross-signed but no backup is exactly the population that hits
        // "no key backup on the server" decryption failures, so the nudge
        // must show. The consumer routes this case through the
        // explicitly-confirmed DeviceVerificationReset flow (never the
        // silent from-scratch bootstrap), and the detail copy says so.
        const v = selectKeyBackupNudge({ crossSigningReady: true, keyBackupReady: false });
        expect(v).not.toBeNull();
        expect(v?.severity).toBe('warn');
        expect(v?.actions[0].id).toBe('enable_key_backup');
        expect(v?.detail).toMatch(/resets device verification/i);
    });
});
