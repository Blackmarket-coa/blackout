// Per-room verification/join gate (Discord-parity "verification level").
// Config lives in the `co.bmc.verification_gate` room state event; the
// membership-age rule is enforced client-side in the composer (mirroring
// slowmode), while the account-age rule is carried in the config for the
// server-side enforcer (the same appservice bucket as `co.bmc.automod`'s
// newAccountRestrictions) since clients cannot see account creation time.
// Logic here is pure so it can be unit-tested without a live room.

export const VERIFICATION_GATE_STATE_EVENT_TYPE = 'co.bmc.verification_gate';

// Discord's strictest membership gate is 10 minutes; allow up to a week
// for high-security dens.
export const MAX_MIN_MEMBERSHIP_MINUTES = 7 * 24 * 60;
// Account-age ceiling: 30 days.
export const MAX_MIN_ACCOUNT_AGE_HOURS = 30 * 24;

export interface VerificationGateConfig {
    enabled: boolean;
    /** Minutes a user must have been a room member before posting. 0 = rule off. */
    minMembershipMinutes: number;
    /**
     * Hours since account creation before posting. 0 = rule off. Clients
     * cannot observe account creation time, so this rule is enforced
     * server-side; it is parsed and round-tripped here so the settings UI
     * and the enforcer share one schema.
     */
    minAccountAgeHours: number;
    /** Members at or above this power level bypass the gate. */
    exemptPowerLevel: number;
}

export const DEFAULT_VERIFICATION_GATE_CONFIG: VerificationGateConfig = {
    enabled: false,
    minMembershipMinutes: 0,
    minAccountAgeHours: 0,
    exemptPowerLevel: 50,
};

const clampInt = (value: unknown, max: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.min(Math.max(0, Math.floor(value)), max);
};

export const parseVerificationGateConfig = (
    content: Record<string, unknown> | undefined | null
): VerificationGateConfig => {
    if (!content || typeof content !== 'object') return DEFAULT_VERIFICATION_GATE_CONFIG;

    const minMembershipMinutes = clampInt(content.minMembershipMinutes, MAX_MIN_MEMBERSHIP_MINUTES);
    const minAccountAgeHours = clampInt(content.minAccountAgeHours, MAX_MIN_ACCOUNT_AGE_HOURS);

    const rawExempt = typeof content.exemptPowerLevel === 'number' ? content.exemptPowerLevel : 50;
    const exemptPowerLevel = Number.isFinite(rawExempt) ? Math.floor(rawExempt) : 50;

    return {
        // A gate with no active rule is not a gate.
        enabled: content.enabled === true && (minMembershipMinutes > 0 || minAccountAgeHours > 0),
        minMembershipMinutes,
        minAccountAgeHours,
        exemptPowerLevel,
    };
};

export type VerificationGateBlockReason = 'membership_age' | 'account_age';

export interface VerificationGateEvaluation {
    allowed: boolean;
    reason: VerificationGateBlockReason | null;
    retryAfterMs: number;
}

const ALLOWED: VerificationGateEvaluation = { allowed: true, reason: null, retryAfterMs: 0 };

export const evaluateVerificationGate = (params: {
    config: VerificationGateConfig;
    /** ts of the caller's join (member event origin_server_ts); null = unknown. */
    joinedAtTs: number | null;
    /** ts of account creation; null = unknown (the common client-side case). */
    accountCreatedTs: number | null;
    now: number;
    userPowerLevel: number;
}): VerificationGateEvaluation => {
    const { config, joinedAtTs, accountCreatedTs, now, userPowerLevel } = params;
    if (!config.enabled) return ALLOWED;
    if (userPowerLevel >= config.exemptPowerLevel) return ALLOWED;

    // Unknown timestamps fail open: the client-side gate is a UX courtesy;
    // the server-side enforcer is authoritative (same stance as slowmode's
    // null lastSentTs).
    if (config.minMembershipMinutes > 0 && joinedAtTs != null) {
        const remaining = config.minMembershipMinutes * 60_000 - (now - joinedAtTs);
        if (remaining > 0) {
            return { allowed: false, reason: 'membership_age', retryAfterMs: remaining };
        }
    }

    if (config.minAccountAgeHours > 0 && accountCreatedTs != null) {
        const remaining = config.minAccountAgeHours * 3_600_000 - (now - accountCreatedTs);
        if (remaining > 0) {
            return { allowed: false, reason: 'account_age', retryAfterMs: remaining };
        }
    }

    return ALLOWED;
};

/** "12 minutes" / "1 minute" / "3 hours" — for the composer notice. */
export const formatGateWait = (retryAfterMs: number): string => {
    const minutes = Math.ceil(retryAfterMs / 60_000);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.ceil(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
};
