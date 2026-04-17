export type StegoPolicyLifecycleStatus = 'draft' | 'active' | 'suspended' | 'revoked' | 'archived';

export type StegoPolicyLifecycleAction =
    | 'activate'
    | 'suspend'
    | 'rotate_keys'
    | 'revoke'
    | 'archive';

export type StegoEphemeralMode = 'persistent' | 'expire_after_hours' | 'delete_on_read';

export interface StegoPolicyConstraintEnvelope {
    maxTtlHours: number;
    minPassphraseLength: number;
    allowedCarriers: Array<'image' | 'audio'>;
}

export interface StegoGovernanceEnvelope {
    policyId: string;
    requiredApprovals: number;
    approvals: string[];
}

export interface StegoPermissionEnvelope {
    principalId: string;
    scopes: string[];
}

export interface StegoEnterprisePolicyState {
    enabled: boolean;
    status: StegoPolicyLifecycleStatus;
    ephemeralMode: StegoEphemeralMode;
    defaultTtlHours: number;
    constraints: StegoPolicyConstraintEnvelope;
    governance: StegoGovernanceEnvelope;
    permission: StegoPermissionEnvelope;
    auditLog: StegoPolicyAuditEntry[];
}

export interface StegoPolicyAuditEntry {
    id: string;
    action: StegoPolicyLifecycleAction;
    actorId: string;
    at: string;
    policyId: string;
    previousStatus: StegoPolicyLifecycleStatus;
    nextStatus: StegoPolicyLifecycleStatus;
    reason: string;
}

export interface PolicyActionDecision {
    allowed: boolean;
    reason?: string;
}

const ACTION_SCOPES: Record<StegoPolicyLifecycleAction, string> = {
    activate: 'stego:policy:activate',
    suspend: 'stego:policy:suspend',
    rotate_keys: 'stego:policy:rotate_keys',
    revoke: 'stego:policy:revoke',
    archive: 'stego:policy:archive',
};

const NEXT_STATUS_BY_ACTION: Record<StegoPolicyLifecycleAction, StegoPolicyLifecycleStatus> = {
    activate: 'active',
    suspend: 'suspended',
    rotate_keys: 'active',
    revoke: 'revoked',
    archive: 'archived',
};

export const DEFAULT_STEGO_ENTERPRISE_POLICY_STATE: StegoEnterprisePolicyState = {
    enabled: false,
    status: 'draft',
    ephemeralMode: 'persistent',
    defaultTtlHours: 24,
    constraints: {
        maxTtlHours: 72,
        minPassphraseLength: 12,
        allowedCarriers: ['image'],
    },
    governance: {
        policyId: 'stego-policy-default',
        requiredApprovals: 1,
        approvals: [],
    },
    permission: {
        principalId: '@local-user:blackout',
        scopes: ['stego:policy:activate', 'stego:policy:rotate_keys'],
    },
    auditLog: [],
};

export function canExecuteStegoPolicyAction(
    state: StegoEnterprisePolicyState,
    action: StegoPolicyLifecycleAction
): PolicyActionDecision {
    if (!state.enabled) {
        return { allowed: false, reason: 'Enable enterprise stego policy plugin first.' };
    }

    if (state.status === 'archived') {
        return { allowed: false, reason: 'Archived policy is immutable.' };
    }

    if (action === 'activate' && state.status !== 'draft' && state.status !== 'suspended') {
        return { allowed: false, reason: 'Policy can only be activated from draft or suspended.' };
    }

    const requiredScope = ACTION_SCOPES[action];
    if (!state.permission.scopes.includes(requiredScope)) {
        return {
            allowed: false,
            reason: `Missing permission scope: ${requiredScope}.`,
        };
    }

    if (state.governance.approvals.length < state.governance.requiredApprovals) {
        return {
            allowed: false,
            reason: 'Insufficient governance approvals for lifecycle change.',
        };
    }

    return { allowed: true };
}

export function applyStegoPolicyLifecycleAction(
    state: StegoEnterprisePolicyState,
    action: StegoPolicyLifecycleAction,
    reason: string,
    now = new Date()
): { next: StegoEnterprisePolicyState; audit: StegoPolicyAuditEntry } {
    const decision = canExecuteStegoPolicyAction(state, action);
    if (!decision.allowed) {
        throw new Error(decision.reason ?? 'Action denied.');
    }

    const nextStatus = NEXT_STATUS_BY_ACTION[action];
    const audit: StegoPolicyAuditEntry = {
        id: `${now.getTime()}-${action}`,
        action,
        actorId: state.permission.principalId,
        at: now.toISOString(),
        policyId: state.governance.policyId,
        previousStatus: state.status,
        nextStatus,
        reason: reason.trim() || 'No reason provided.',
    };

    return {
        next: {
            ...state,
            status: nextStatus,
            auditLog: [audit, ...state.auditLog].slice(0, 50),
        },
        audit,
    };
}

export function enforceStegoPolicyConstraints(
    state: StegoEnterprisePolicyState,
    payload: { ttlHours?: number; passphraseLength?: number; carrier: 'image' | 'audio' }
): PolicyActionDecision {
    if (!state.enabled) return { allowed: true };

    if (!state.constraints.allowedCarriers.includes(payload.carrier)) {
        return { allowed: false, reason: `Carrier ${payload.carrier} is not allowed by policy.` };
    }

    if (
        typeof payload.passphraseLength === 'number' &&
        payload.passphraseLength < state.constraints.minPassphraseLength
    ) {
        return {
            allowed: false,
            reason: `Passphrase must be at least ${state.constraints.minPassphraseLength} characters.`,
        };
    }

    const ttlHours = payload.ttlHours ?? state.defaultTtlHours;
    if (ttlHours < 1 || ttlHours > state.constraints.maxTtlHours) {
        return {
            allowed: false,
            reason: `TTL must be between 1 and ${state.constraints.maxTtlHours} hours.`,
        };
    }

    return { allowed: true };
}
