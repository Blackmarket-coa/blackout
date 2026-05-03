/**
 * Pure functions that summarize a user's E2EE posture into a single verdict
 * suitable for room headers, DM banners, and onboarding gates. Keeping the
 * logic in pure functions lets it be unit-tested without React or matrix-js-sdk.
 */

export type DeviceVerificationVerdict = 'verified' | 'unverified' | 'unknown';

export interface DeviceSummary {
    deviceId: string;
    verification: DeviceVerificationVerdict;
}

export interface MemberSummary {
    userId: string;
    devices: DeviceSummary[];
}

export interface AccountPosture {
    /** Whether the local user has set up cross-signing. */
    crossSigningReady: boolean;
    /** Whether the local user has a key backup / recovery key. */
    recoveryConfigured: boolean;
    /** Whether the current device is cross-signed-verified. */
    currentDeviceVerified: boolean;
    /** Other own sessions; used for "verify-from-existing-device" UX. */
    otherOwnDevices: DeviceSummary[];
    /** Members of the conversation in question (excluding self). */
    members: MemberSummary[];
}

export type PostureSeverity = 'ok' | 'info' | 'warn' | 'critical';

export interface PostureVerdict {
    severity: PostureSeverity;
    headline: string;
    detail: string;
    actions: PostureAction[];
}

export type PostureActionId =
    | 'enable_cross_signing'
    | 'set_up_recovery'
    | 'verify_current_device'
    | 'review_unverified_members';

export interface PostureAction {
    id: PostureActionId;
    label: string;
}

const countUnverified = (members: MemberSummary[]) =>
    members.reduce(
        (acc, m) => acc + m.devices.filter((d) => d.verification !== 'verified').length,
        0,
    );

export const summarizePosture = (input: AccountPosture): PostureVerdict => {
    const { crossSigningReady, recoveryConfigured, currentDeviceVerified, otherOwnDevices, members } =
        input;

    if (!crossSigningReady) {
        return {
            severity: 'critical',
            headline: 'End-to-end encryption is not set up',
            detail:
                'Set up cross-signing so messages can be verified across your devices and shared with new sessions.',
            actions: [{ id: 'enable_cross_signing', label: 'Set up cross-signing' }],
        };
    }

    if (!currentDeviceVerified) {
        const hasOtherOwn = otherOwnDevices.some((d) => d.verification === 'verified');
        return {
            severity: 'critical',
            headline: 'This device is not verified',
            detail: hasOtherOwn
                ? 'Verify this device from another verified session, or use your recovery key.'
                : 'Verify with your recovery key — no other verified session is available.',
            actions: [{ id: 'verify_current_device', label: 'Verify this device' }],
        };
    }

    if (!recoveryConfigured) {
        return {
            severity: 'warn',
            headline: 'No recovery key is set',
            detail:
                'Without recovery you will lose your message history if you sign out of every device. Set up a recovery key now.',
            actions: [{ id: 'set_up_recovery', label: 'Set up recovery' }],
        };
    }

    const unverifiedCount = countUnverified(members);
    if (unverifiedCount > 0) {
        return {
            severity: 'info',
            headline: `${unverifiedCount} unverified ${unverifiedCount === 1 ? 'device' : 'devices'} in this conversation`,
            detail: 'Messages remain end-to-end encrypted. Verify members to confirm their identity.',
            actions: [{ id: 'review_unverified_members', label: 'Review members' }],
        };
    }

    return {
        severity: 'ok',
        headline: 'End-to-end encrypted and verified',
        detail: 'Your device, recovery, and every member in this conversation are verified.',
        actions: [],
    };
};

/**
 * Onboarding gate. Returns true when the operator policy requires the user
 * to set up cross-signing and recovery before they can send their first
 * encrypted message. Default policy: hard-require both, matching the
 * Element April-2026 verified-device-only norm.
 */
export interface OnboardingPolicy {
    requireCrossSigning: boolean;
    requireRecovery: boolean;
}

export const DEFAULT_ONBOARDING_POLICY: OnboardingPolicy = {
    requireCrossSigning: true,
    requireRecovery: true,
};

export const onboardingBlocked = (
    posture: Pick<AccountPosture, 'crossSigningReady' | 'recoveryConfigured'>,
    policy: OnboardingPolicy = DEFAULT_ONBOARDING_POLICY,
): boolean =>
    (policy.requireCrossSigning && !posture.crossSigningReady) ||
    (policy.requireRecovery && !posture.recoveryConfigured);
