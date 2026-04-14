import type { EntitlementAccessPayload, EntitlementMap, EntitlementTier, PlanState, PlanStateStatus } from './types';

const ENTITLEMENT_TIERS: EntitlementTier[] = ['free', 'pro', 'team', 'enterprise'];
const PLAN_STATE_STATUSES: PlanStateStatus[] = ['trialing', 'active', 'past_due', 'canceled', 'inactive'];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function parseEntitlementMap(value: unknown, field: string): EntitlementMap {
    if (!isRecord(value)) {
        throw new Error(`${field} must be an object`);
    }

    const output: EntitlementMap = {};
    for (const [key, enabled] of Object.entries(value)) {
        if (!key.startsWith('features.')) {
            throw new Error(`${field} has invalid key: ${key}`);
        }
        if (typeof enabled !== 'boolean') {
            throw new Error(`${field}.${key} must be a boolean`);
        }
        output[key as `features.${string}`] = enabled;
    }
    return output;
}

function parsePlanState(value: unknown): PlanState {
    if (!isRecord(value)) {
        throw new Error('planState must be an object');
    }

    const tier = value.tier;
    const status = value.status;
    const isPaid = value.isPaid;

    if (!ENTITLEMENT_TIERS.includes(tier as EntitlementTier)) {
        throw new Error('planState.tier is invalid');
    }
    if (!PLAN_STATE_STATUSES.includes(status as PlanStateStatus)) {
        throw new Error('planState.status is invalid');
    }
    if (typeof isPaid !== 'boolean') {
        throw new Error('planState.isPaid must be a boolean');
    }

    if (value.trialEndsAt !== undefined && typeof value.trialEndsAt !== 'string') {
        throw new Error('planState.trialEndsAt must be a string when provided');
    }
    if (value.currentPeriodEndsAt !== undefined && typeof value.currentPeriodEndsAt !== 'string') {
        throw new Error('planState.currentPeriodEndsAt must be a string when provided');
    }

    return {
        tier: tier as EntitlementTier,
        status: status as PlanStateStatus,
        isPaid,
        trialEndsAt: value.trialEndsAt as string | undefined,
        currentPeriodEndsAt: value.currentPeriodEndsAt as string | undefined,
    };
}

export function parseEntitlementAccessPayload(value: unknown): EntitlementAccessPayload {
    if (!isRecord(value)) {
        throw new Error('entitlement payload must be an object');
    }

    if (typeof value.deploymentPreset !== 'string' || !value.deploymentPreset.trim()) {
        throw new Error('deploymentPreset must be a non-empty string');
    }

    const deploymentPresetEntitlements = parseEntitlementMap(value.deploymentPresetEntitlements, 'deploymentPresetEntitlements');

    if (value.orgTier !== undefined && !ENTITLEMENT_TIERS.includes(value.orgTier as EntitlementTier)) {
        throw new Error('orgTier is invalid');
    }

    return {
        deploymentPreset: value.deploymentPreset,
        deploymentPresetEntitlements,
        orgTier: value.orgTier as EntitlementTier | undefined,
        orgTierEntitlements: value.orgTierEntitlements === undefined
            ? undefined
            : parseEntitlementMap(value.orgTierEntitlements, 'orgTierEntitlements'),
        userOverrideEntitlements: value.userOverrideEntitlements === undefined
            ? undefined
            : parseEntitlementMap(value.userOverrideEntitlements, 'userOverrideEntitlements'),
        planState: value.planState === undefined ? undefined : parsePlanState(value.planState),
    };
}
