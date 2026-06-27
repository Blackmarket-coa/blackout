/**
 * Smart Split Contract contracts (creator-economy revenue splits).
 *
 * A "split contract" records how revenue from one or more sources is divided
 * between collaborating parties (creator + co-creators + the platform). When a
 * creator activates a split from the FBM creator portal, FBM calls Blackout to
 * write the contract as a Matrix **state event** in the creator's Space. The
 * resulting Matrix event id becomes the contract's canonical, tamper-evident
 * proof.
 *
 * Immutability is the point: once a state event is sent it cannot be deleted
 * from the room. "Archiving" a contract = sending a fresh state event with the
 * same state key and `status: 'archived'`; every prior version survives in room
 * history. Surfaces that let a creator activate a contract must say so plainly
 * ("permanently recorded … cannot be modified, only archived").
 *
 * FBM remains the authoritative ledger for the money itself; this state event
 * is the immutable audit trail, not the settlement engine.
 */

export const SPLIT_CONTRACT_PROTOCOL_VERSION = 1 as const;

/** Matrix state event type. State key = `contractId`. */
export const SPLIT_CONTRACT_EVENT_TYPE = 'co.bmc.split_contract' as const;

export const SPLIT_CONTRACT_STATUSES = ['active', 'archived'] as const;
export type SplitContractStatus = (typeof SPLIT_CONTRACT_STATUSES)[number];

/** A single party to the split and their share. */
export interface SplitContractParty {
    /** The party's Matrix id (canonical identity). */
    matrixId: string;
    /** The party's FBM vendor id, for ledger settlement on the FBM side. */
    fbmVendorId: string;
    /** Whole-or-fractional percentage of the split. All parties must sum to 100. */
    percentage: number;
    /** Free-text role label, e.g. "creator", "editor", "platform". */
    role: string;
}

/**
 * The state-event payload written to `co.bmc.split_contract`
 * (state key = `contractId`). One state event per contract version.
 */
export interface SplitContractPayload {
    /** Stable id; doubles as the Matrix state key. */
    contractId: string;
    /** Short human-readable contract name. */
    name: string;
    /** Identifiers of the revenue sources this split applies to (FBM product/listing ids). */
    appliesTo: string[];
    /** Parties and their shares. Percentages must sum to 100. */
    parties: SplitContractParty[];
    /** ISO-8601 timestamp the split takes effect. */
    effectiveFrom: string;
    /** Optional ISO-8601 timestamp the split stops applying. */
    effectiveUntil?: string;
    /** Minimum gross (minor units) before the split applies; 0 = always. */
    minimumThresholdCents: number;
    status: SplitContractStatus;
}

export const isSplitContractStatus = (value: unknown): value is SplitContractStatus =>
    typeof value === 'string' &&
    (SPLIT_CONTRACT_STATUSES as readonly string[]).includes(value);

const PERCENTAGE_EPSILON = 1e-6;

const isSplitContractParty = (value: unknown): value is SplitContractParty => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.matrixId !== 'string' || p.matrixId.length === 0) return false;
    if (typeof p.fbmVendorId !== 'string' || p.fbmVendorId.length === 0) return false;
    if (typeof p.percentage !== 'number' || !Number.isFinite(p.percentage)) return false;
    if (p.percentage < 0 || p.percentage > 100) return false;
    if (typeof p.role !== 'string' || p.role.length === 0) return false;
    return true;
};

/** True when every party is valid and their percentages sum to 100 (within epsilon). */
export const splitPercentagesAreValid = (parties: readonly SplitContractParty[]): boolean => {
    if (parties.length === 0) return false;
    const total = parties.reduce((sum, party) => sum + party.percentage, 0);
    return Math.abs(total - 100) <= PERCENTAGE_EPSILON;
};

export const isSplitContractPayload = (value: unknown): value is SplitContractPayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.contractId !== 'string' || p.contractId.length === 0) return false;
    if (typeof p.name !== 'string' || p.name.length === 0) return false;
    if (!Array.isArray(p.appliesTo) || !p.appliesTo.every((a) => typeof a === 'string')) {
        return false;
    }
    if (!Array.isArray(p.parties) || !p.parties.every(isSplitContractParty)) return false;
    if (!splitPercentagesAreValid(p.parties as SplitContractParty[])) return false;
    if (typeof p.effectiveFrom !== 'string') return false;
    if (p.effectiveUntil !== undefined && typeof p.effectiveUntil !== 'string') return false;
    if (
        typeof p.minimumThresholdCents !== 'number' ||
        !Number.isFinite(p.minimumThresholdCents) ||
        p.minimumThresholdCents < 0
    ) {
        return false;
    }
    if (!isSplitContractStatus(p.status)) return false;
    return true;
};

export interface SplitContractProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof SPLIT_CONTRACT_PROTOCOL_VERSION;
    policy: 'additive-only-minor';
}

export const SPLIT_CONTRACT_PROTOCOL_SURFACE: SplitContractProtocolSurface = {
    owner: '@blackout/protocol',
    version: SPLIT_CONTRACT_PROTOCOL_VERSION,
    policy: 'additive-only-minor',
};
