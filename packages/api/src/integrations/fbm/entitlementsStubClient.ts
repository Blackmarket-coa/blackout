// In-memory fixture implementing the FBM Entitlements Service contract for
// dev/test (selected when FBM_ENTITLEMENTS_STUB=1). Lets the entitlements
// consumer + the Matrix ACL sync worker be exercised end-to-end without a live
// FBM service. Seed governance roles per MXID so the ACL sync worker has
// `matrixAcls` to apply.

import type {
    AccessCheckRequest,
    AccessCheckResult,
    CoalitionMembership,
    EconomicStanding,
    EntitlementsSummary,
    FbmEntitlementsClient,
    GovernanceRole,
    Mxid,
} from './entitlementsContract';

interface SeededEntitlements {
    economicStanding?: Partial<EconomicStanding>;
    governanceRoles?: GovernanceRole[];
    coalitionMemberships?: CoalitionMembership[];
    /** Explicit allow-list of "urn|action" the user may access. */
    allow?: Set<string>;
}

const EMPTY_STANDING: EconomicStanding = {
    coalitionCreditsBalanceMinorUnits: 0,
    pendingPayouts: [],
    vendorSalesVolumeMinorUnits30d: null,
    creatorRewardEligibility: [],
};

export class FbmEntitlementsStubClient implements FbmEntitlementsClient {
    private readonly byMxid = new Map<Mxid, SeededEntitlements>();

    /** Test/dev seam: set the entitlements a given MXID resolves to. */
    seed(mxid: Mxid, data: SeededEntitlements): void {
        this.byMxid.set(mxid, data);
    }

    reset(): void {
        this.byMxid.clear();
    }

    async checkAccess(mxid: Mxid, request: AccessCheckRequest): Promise<AccessCheckResult> {
        const seeded = this.byMxid.get(mxid);
        const allowed = seeded?.allow?.has(`${request.urn}|${request.action}`) ?? false;
        return { allowed, source: allowed ? 'stub-allow' : 'no-membership' };
    }

    async checkAccessBatch(
        mxid: Mxid,
        requests: AccessCheckRequest[]
    ): Promise<AccessCheckResult[]> {
        return Promise.all(requests.map((r) => this.checkAccess(mxid, r)));
    }

    async getEconomicStanding(mxid: Mxid): Promise<EconomicStanding> {
        return { ...EMPTY_STANDING, ...(this.byMxid.get(mxid)?.economicStanding ?? {}) };
    }

    async getGovernanceRoles(mxid: Mxid): Promise<GovernanceRole[]> {
        return this.byMxid.get(mxid)?.governanceRoles ?? [];
    }

    async getCoalitionMemberships(mxid: Mxid): Promise<CoalitionMembership[]> {
        return this.byMxid.get(mxid)?.coalitionMemberships ?? [];
    }

    async getSummary(mxid: Mxid): Promise<EntitlementsSummary> {
        return {
            mxid,
            economicStanding: await this.getEconomicStanding(mxid),
            governanceRoles: await this.getGovernanceRoles(mxid),
            coalitionMemberships: await this.getCoalitionMemberships(mxid),
            cacheTtlSeconds: 30,
        };
    }
}
