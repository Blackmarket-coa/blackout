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

    it('stays silent when cross-signing already exists (avoids a destructive reset)', () => {
        // Verified/cross-signed but no backup: the from-scratch setup flow would
        // reset secret storage, so the focused nudge must not offer it here.
        expect(selectKeyBackupNudge({ crossSigningReady: true, keyBackupReady: false })).toBeNull();
    });
});
