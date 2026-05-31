// Factory + caching layer for the FBM Entitlements Service client.
//
// Selection: FBM_ENTITLEMENTS_STUB=1 → in-memory stub; else a live HTTP client
// when FBM_ENTITLEMENTS_BASE_URL + FBM_ENTITLEMENTS_SERVICE_TOKEN are set; else
// undefined (entitlements not configured — callers no-op). The HTTP client is
// wrapped in a per-endpoint TTL cache per docs/contracts/fbm-entitlements-consumer.md
// (server-side only; aggressive caching is expected since browsers never call it).

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
import { FbmEntitlementsHttpClient } from './entitlementsClient';
import { FbmEntitlementsStubClient } from './entitlementsStubClient';

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

class TtlCache {
    private readonly map = new Map<string, CacheEntry<unknown>>();
    get<T>(key: string): T | undefined {
        const hit = this.map.get(key);
        if (!hit) return undefined;
        if (Date.now() >= hit.expiresAt) {
            this.map.delete(key);
            return undefined;
        }
        return hit.value as T;
    }
    set<T>(key: string, value: T, ttlMs: number): void {
        this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    clear(): void {
        this.map.clear();
    }
}

/** Wraps any client with the consumer-doc per-endpoint cache windows. */
export class CachingEntitlementsClient implements FbmEntitlementsClient {
    private readonly cache = new TtlCache();
    constructor(private readonly inner: FbmEntitlementsClient) {}

    async checkAccess(mxid: Mxid, request: AccessCheckRequest): Promise<AccessCheckResult> {
        const key = `access|${mxid}|${request.urn}|${request.action}`;
        const cached = this.cache.get<AccessCheckResult>(key);
        if (cached) return cached;
        const result = await this.inner.checkAccess(mxid, request);
        this.cache.set(key, result, 60_000);
        return result;
    }

    // Batch is not cached as a unit (the doc caches per single check); delegate.
    checkAccessBatch(mxid: Mxid, requests: AccessCheckRequest[]): Promise<AccessCheckResult[]> {
        return Promise.all(requests.map((r) => this.checkAccess(mxid, r)));
    }

    async getEconomicStanding(mxid: Mxid): Promise<EconomicStanding> {
        const key = `standing|${mxid}`;
        const cached = this.cache.get<EconomicStanding>(key);
        if (cached) return cached;
        const result = await this.inner.getEconomicStanding(mxid);
        this.cache.set(key, result, 30_000);
        return result;
    }

    async getGovernanceRoles(mxid: Mxid): Promise<GovernanceRole[]> {
        const key = `roles|${mxid}`;
        const cached = this.cache.get<GovernanceRole[]>(key);
        if (cached) return cached;
        const result = await this.inner.getGovernanceRoles(mxid);
        this.cache.set(key, result, 60_000);
        return result;
    }

    async getCoalitionMemberships(mxid: Mxid): Promise<CoalitionMembership[]> {
        const key = `coalitions|${mxid}`;
        const cached = this.cache.get<CoalitionMembership[]>(key);
        if (cached) return cached;
        const result = await this.inner.getCoalitionMemberships(mxid);
        this.cache.set(key, result, 120_000);
        return result;
    }

    async getSummary(mxid: Mxid): Promise<EntitlementsSummary> {
        const key = `summary|${mxid}`;
        const cached = this.cache.get<EntitlementsSummary>(key);
        if (cached) return cached;
        const result = await this.inner.getSummary(mxid);
        // Honor server TTL, capped at 30s.
        const ttl = Math.min(Math.max(result.cacheTtlSeconds, 0), 30) * 1000;
        if (ttl > 0) this.cache.set(key, result, ttl);
        return result;
    }

    clearCacheForTest(): void {
        this.cache.clear();
    }
}

const useStub = (env = process.env): boolean =>
    env.FBM_ENTITLEMENTS_STUB === '1' || env.FBM_ENTITLEMENTS_STUB?.toLowerCase() === 'true';

let cached: FbmEntitlementsClient | undefined | null = null; // null = uninitialised
let stubInstance: FbmEntitlementsStubClient | undefined;

/**
 * Resolve the process-wide entitlements client, or `undefined` when the service
 * is not configured (callers must treat that as "entitlements unavailable" and
 * degrade — e.g. the ACL sync worker no-ops).
 */
export function getEntitlementsClient(env = process.env): FbmEntitlementsClient | undefined {
    if (cached !== null) return cached;
    if (useStub(env)) {
        stubInstance = new FbmEntitlementsStubClient();
        cached = stubInstance;
        return cached;
    }
    const baseUrl = env.FBM_ENTITLEMENTS_BASE_URL;
    const serviceToken = env.FBM_ENTITLEMENTS_SERVICE_TOKEN;
    if (!baseUrl || !serviceToken) {
        cached = undefined;
        return cached;
    }
    cached = new CachingEntitlementsClient(
        new FbmEntitlementsHttpClient({ baseUrl, serviceToken })
    );
    return cached;
}

/** Test seam: the seeded stub instance (only present when FBM_ENTITLEMENTS_STUB=1). */
export function getEntitlementsStubForTest(): FbmEntitlementsStubClient | undefined {
    return stubInstance;
}

/** Test seam: drop the cached singleton so env changes take effect. */
export function resetEntitlementsClientForTest(): void {
    cached = null;
    stubInstance?.reset();
    stubInstance = undefined;
}
