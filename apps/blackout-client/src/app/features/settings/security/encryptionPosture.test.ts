import { describe, expect, it } from 'vitest';
import {
    DEFAULT_ONBOARDING_POLICY,
    onboardingBlocked,
    selectKeyBackupNudge,
    KEY_BACKUP_NUDGE_ACTION_LABEL,
    KEY_BACKUP_NUDGE_CHECKING,
    KEY_BACKUP_NUDGE_GUARD_TEXTS,
    KEY_BACKUP_NUDGE_TEXT,
    summarizePosture,
    type AccountPosture,
} from './encryptionPosture';

const base: AccountPosture = {
    crossSigningReady: true,
    currentDeviceVerified: true,
    otherOwnDevices: [],
    members: [],
};

describe('summarizePosture', () => {
    it('returns ok when everything is set up and verified', () => {
        const v = summarizePosture(base);
        expect(v.severity).toBe('ok');
        expect(v.headline).toMatch(/encrypted and verified/i);
        expect(v.actions).toHaveLength(0);
    });

    it('flags critical when cross-signing is not set up', () => {
        const v = summarizePosture({ ...base, crossSigningReady: false });
        expect(v.severity).toBe('critical');
        expect(v.actions[0].id).toBe('enable_cross_signing');
    });

    it('flags critical when current device is not verified', () => {
        const v = summarizePosture({ ...base, currentDeviceVerified: false });
        expect(v.severity).toBe('critical');
        expect(v.actions[0].id).toBe('verify_current_device');
        expect(v.detail).toMatch(/recovery key/);
    });

    it('suggests using another verified session when one exists', () => {
        const v = summarizePosture({
            ...base,
            currentDeviceVerified: false,
            otherOwnDevices: [{ deviceId: 'D2', verification: 'verified' }],
        });
        expect(v.detail).toMatch(/another verified session/);
    });

    it('reports unverified members as info-severity', () => {
        const v = summarizePosture({
            ...base,
            members: [
                {
                    userId: '@bob:server',
                    devices: [
                        { deviceId: 'B1', verification: 'verified' },
                        { deviceId: 'B2', verification: 'unverified' },
                    ],
                },
            ],
        });
        expect(v.severity).toBe('info');
        expect(v.headline).toMatch(/1 unverified device/);
    });

    it('pluralizes the unverified-device headline correctly', () => {
        const v = summarizePosture({
            ...base,
            members: [
                {
                    userId: '@bob:server',
                    devices: [
                        { deviceId: 'B1', verification: 'unverified' },
                        { deviceId: 'B2', verification: 'unverified' },
                    ],
                },
            ],
        });
        expect(v.headline).toMatch(/2 unverified devices/);
    });

    it('orders critical conditions ahead of member warnings', () => {
        const v = summarizePosture({
            crossSigningReady: false,
            currentDeviceVerified: false,
            otherOwnDevices: [],
            members: [
                {
                    userId: '@bob:server',
                    devices: [{ deviceId: 'B1', verification: 'unverified' }],
                },
            ],
        });
        expect(v.severity).toBe('critical');
        expect(v.actions[0].id).toBe('enable_cross_signing');
    });
});

describe('selectKeyBackupNudge', () => {
    it('nudges a cross-signed account that has no key backup', () => {
        const v = selectKeyBackupNudge({
            crossSigningReady: true,
            keyBackupReady: false,
            accountState: 'cross_signing',
        });
        expect(v).not.toBeNull();
        expect(v?.severity).toBe('warn');
        expect(v?.actions[0].id).toBe('enable_key_backup');
        // The detail must flag that the action resets device verification,
        // since the consumer routes cross-signed users through the
        // explicitly-confirmed reset flow.
        expect(v?.detail).toMatch(/resets device verification/i);
        expect(v?.headline).toBe(KEY_BACKUP_NUDGE_TEXT.crossSigningReady.headline);
        expect(v?.detail).toBe(KEY_BACKUP_NUDGE_TEXT.crossSigningReady.detail);
        // The reset screen it opens says a backup "will be lost"; this row is
        // reached only when the check answered that none exists, so the
        // detail does not send the person to that screen for an explanation.
        expect(v?.detail).not.toMatch(/next screen/i);
    });

    it('nudges when encryption is not set up at all', () => {
        const v = selectKeyBackupNudge({
            crossSigningReady: false,
            keyBackupReady: false,
            accountState: 'none',
        });
        expect(v).not.toBeNull();
        expect(v?.severity).toBe('warn');
        expect(v?.headline).toMatch(/backup/i);
        expect(v?.actions[0].id).toBe('enable_key_backup');
        expect(v?.actions[0].label).toBe(KEY_BACKUP_NUDGE_ACTION_LABEL);
        expect(v?.headline).toBe(KEY_BACKUP_NUDGE_TEXT.none.headline);
        expect(v?.detail).toBe(KEY_BACKUP_NUDGE_TEXT.none.detail);
    });

    it('stays silent once a key backup exists', () => {
        for (const accountState of ['none', 'backup', 'cross_signing', 'unknown'] as const) {
            expect(
                selectKeyBackupNudge({
                    crossSigningReady: false,
                    keyBackupReady: true,
                    accountState,
                })
            ).toBeNull();
            expect(
                selectKeyBackupNudge({
                    crossSigningReady: true,
                    keyBackupReady: true,
                    accountState,
                })
            ).toBeNull();
        }
    });

    // The account-level guard (S9, docs/security/key-backup-nudge-2026-11-02.md):
    // an action is offered only when the homeserver answered that there is
    // nothing to replace, or when this device already trusts the account's
    // cross-signing and no backup exists.
    it('offers nothing when cross-signing exists but this device is not verified', () => {
        const v = selectKeyBackupNudge({
            crossSigningReady: false,
            keyBackupReady: false,
            accountState: 'cross_signing',
        });
        expect(v?.actions).toEqual([]);
        expect(v?.headline).toBe(KEY_BACKUP_NUDGE_TEXT.crossSigningNotReady.headline);
        expect(v?.detail).toBe(KEY_BACKUP_NUDGE_TEXT.crossSigningNotReady.detail);
    });

    it('offers nothing when the account already has a backup, whatever this device says', () => {
        for (const crossSigningReady of [false, true]) {
            const v = selectKeyBackupNudge({
                crossSigningReady,
                keyBackupReady: false,
                accountState: 'backup',
            });
            expect(v?.actions).toEqual([]);
            expect(v?.headline).toBe(KEY_BACKUP_NUDGE_TEXT.backup.headline);
            expect(v?.detail).toBe(KEY_BACKUP_NUDGE_TEXT.backup.detail);
        }
    });

    it('offers nothing when the check failed, and says it could not check', () => {
        for (const crossSigningReady of [false, true]) {
            const v = selectKeyBackupNudge({
                crossSigningReady,
                keyBackupReady: false,
                accountState: 'unknown',
            });
            expect(v?.actions).toEqual([]);
            expect(v?.headline).toBe(KEY_BACKUP_NUDGE_TEXT.unknown.headline);
            expect(v?.detail).toBe(KEY_BACKUP_NUDGE_TEXT.unknown.detail);
            expect(v?.detail).toMatch(/couldn.t finish checking/i);
            // 'unknown' also covers a backup check that answered "none" while
            // the cross-signing check failed, so the text names both checks.
            expect(v?.detail).toMatch(/key backup or cross-signing/);
        }
    });

    it('the click-time overlay texts are the rows’ own sentences, plus the wait', () => {
        expect(KEY_BACKUP_NUDGE_GUARD_TEXTS.checking).toBe(KEY_BACKUP_NUDGE_CHECKING);
        expect(KEY_BACKUP_NUDGE_GUARD_TEXTS.backup).toBe(KEY_BACKUP_NUDGE_TEXT.backup.detail);
        expect(KEY_BACKUP_NUDGE_GUARD_TEXTS.not_verified).toBe(
            KEY_BACKUP_NUDGE_TEXT.crossSigningNotReady.detail
        );
        expect(KEY_BACKUP_NUDGE_GUARD_TEXTS.check_failed).toBe(
            KEY_BACKUP_NUDGE_TEXT.unknown.detail
        );
        expect(KEY_BACKUP_NUDGE_CHECKING).toMatch(/^Checking /);
    });

    it('no verdict promises a recovery Blackout cannot do', () => {
        for (const text of Object.values(KEY_BACKUP_NUDGE_TEXT)) {
            expect(text.detail).not.toMatch(
                /recover(ed|able)? when you sign in on a new device|don.t lose access/i
            );
        }
    });
});

describe('onboardingBlocked', () => {
    it('blocks when cross-signing is missing under default policy', () => {
        expect(onboardingBlocked({ crossSigningReady: false })).toBe(true);
    });

    it('passes through when cross-signing is configured', () => {
        expect(onboardingBlocked({ crossSigningReady: true })).toBe(false);
    });

    it('honors a relaxed policy', () => {
        expect(
            onboardingBlocked({ crossSigningReady: false }, { requireCrossSigning: false })
        ).toBe(false);
    });

    it('is consistent with DEFAULT_ONBOARDING_POLICY', () => {
        expect(DEFAULT_ONBOARDING_POLICY.requireCrossSigning).toBe(true);
    });
});
