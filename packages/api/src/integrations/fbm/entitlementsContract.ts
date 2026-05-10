// Blackout-side consumer surface for the FBM Entitlements Service.
//
// AOG §2.5 commits to a single FBM-hosted entitlements service that
// answers four questions about (MXID, resource) pairs. The canonical
// OpenAPI specification will live in the FBM repo at
// docs/contracts/entitlements.yaml. This file is the consumer-side
// mirror — narrower than the canonical contract and pinned to the
// slice that Blackout actually consumes (read-only).
//
// Companion document: docs/contracts/fbm-entitlements-consumer.md.
//
// No runtime client implementation lives here. The Coalition Credits
// widget and cooperative governance UI (Foundation milestone rows in
// AOG §9.2) target this interface; a stub fixture is used in
// dev/test until FBM publishes the OpenAPI spec and we generate or
// hand-write the HTTP client.

/** Matrix MXID, e.g. "@alice:example.org". */
export type Mxid = string;

/** URN naming a resource the entitlements service can reason about. */
export type ResourceUrn =
    | `urn:fbm:room:${string}`
    | `urn:fbm:listing:${string}`
    | `urn:fbm:proposal:${string}`
    | `urn:fbm:fulfillment-node:${string}`
    | `urn:fbm:ledger-tx:${string}`
    | 'urn:fbm:platform:admin';

export type AccessAction = 'read' | 'write' | 'administer';

// ---------------------------------------------------------------------------
// Question 1 — Access
// ---------------------------------------------------------------------------

export interface AccessCheckRequest {
    urn: ResourceUrn;
    action: AccessAction;
}

export interface AccessCheckResult {
    allowed: boolean;
    /**
     * Free-form descriptor of why access was granted or denied
     * (e.g. "coalition-role:steward", "ownership", "platform-admin",
     * "no-membership"). Surfaced for audit logs; do not branch on it.
     */
    source: string;
}

// ---------------------------------------------------------------------------
// Question 2 — Economic standing
// ---------------------------------------------------------------------------

export interface PendingPayout {
    /** ISO 4217 currency code OR "CC" for Coalition Credits. */
    currency: string;
    amountMinorUnits: number;
    expectedSettlementAt: string | null;
}

export interface CreatorRewardEligibility {
    program: string;
    eligible: boolean;
    /** Human-readable reason; null when eligible. */
    blockedReason: string | null;
}

export interface EconomicStanding {
    coalitionCreditsBalanceMinorUnits: number;
    pendingPayouts: PendingPayout[];
    /**
     * Trailing 30-day vendor sales volume in minor units of the
     * vendor's settlement currency. Null when the user is not a
     * vendor.
     */
    vendorSalesVolumeMinorUnits30d: number | null;
    creatorRewardEligibility: CreatorRewardEligibility[];
}

// ---------------------------------------------------------------------------
// Question 3 — Governance roles
// ---------------------------------------------------------------------------

export interface GovernanceRole {
    coalitionId: string;
    /** e.g. "steward", "treasurer", "member". */
    role: string;
    /**
     * Matrix room ACLs that follow from this role. Applied verbatim
     * by the Blackout-side ACL sync worker — Blackout does not
     * re-derive them.
     */
    matrixAcls: { roomId: string; powerLevel: number }[];
    /** FBM commerce permissions that follow from this role. */
    commercePermissions: string[];
}

// ---------------------------------------------------------------------------
// Question 4 — Coalition membership
// ---------------------------------------------------------------------------

export type CoalitionMembershipStatus =
    | 'active'
    | 'pending'
    | 'suspended'
    | 'expelled'
    | 'former';

export interface CoalitionMembership {
    coalitionId: string;
    coalitionDisplayName: string;
    status: CoalitionMembershipStatus;
    joinedAt: string;
    /**
     * Coalition-specific entitlements that follow from membership.
     * Free-form strings drawn from the FBM coalition module's
     * entitlement vocabulary.
     */
    coalitionEntitlements: string[];
}

// ---------------------------------------------------------------------------
// Batch-render summary (drives Coalition Credits widget render path)
// ---------------------------------------------------------------------------

export interface EntitlementsSummary {
    mxid: Mxid;
    economicStanding: EconomicStanding;
    governanceRoles: GovernanceRole[];
    coalitionMemberships: CoalitionMembership[];
    /** Server-supplied freshness window in seconds. */
    cacheTtlSeconds: number;
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

/**
 * Read-only client for the FBM Entitlements Service. Implementations:
 *
 * - HTTP client against a live FBM service (not yet written; awaiting
 *   the FBM-side OpenAPI specification).
 * - In-memory fixture for dev/test.
 *
 * Consumer-side conventions (timeouts, retries, cache-control,
 * fallback behaviour) are documented in
 * docs/contracts/fbm-entitlements-consumer.md.
 */
export interface FbmEntitlementsClient {
    checkAccess(mxid: Mxid, request: AccessCheckRequest): Promise<AccessCheckResult>;
    checkAccessBatch(
        mxid: Mxid,
        requests: AccessCheckRequest[]
    ): Promise<AccessCheckResult[]>;
    getEconomicStanding(mxid: Mxid): Promise<EconomicStanding>;
    getGovernanceRoles(mxid: Mxid): Promise<GovernanceRole[]>;
    getCoalitionMemberships(mxid: Mxid): Promise<CoalitionMembership[]>;
    /**
     * Combined Q2 + Q3 + Q4 fetch. Preferred for dashboard render
     * paths (Coalition Credits widget) so the page load doesn't
     * require three sequential round trips.
     */
    getSummary(mxid: Mxid): Promise<EntitlementsSummary>;
}
