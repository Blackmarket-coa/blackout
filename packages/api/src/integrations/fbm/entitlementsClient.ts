// HTTP client for the FBM Entitlements Service (AOG §2.5). Implements the
// read-only `FbmEntitlementsClient` consumer contract against the OpenAPI
// operationIds in docs/contracts/fbm-entitlements.openapi.yaml, honouring the
// operational policy in docs/contracts/fbm-entitlements-consumer.md:
//   - connect/read timeouts 2s/3s,
//   - 2 retries (3 attempts) on 5xx / network / timeout, jittered backoff,
//   - a simple consecutive-failure circuit breaker (open after 5; half-open 30s).
// Caching is layered on top by the factory, not here.

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

const CONNECT_TIMEOUT_MS = 2_000;
const READ_TIMEOUT_MS = 3_000;
const MAX_ATTEMPTS = 3; // 1 try + 2 retries
const BACKOFFS_MS = [200, 600];
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

export class FbmEntitlementsServiceError extends Error {
    constructor(
        message: string,
        readonly code:
            | 'circuit_open'
            | 'unauthorized'
            | 'forbidden'
            | 'not_found'
            | 'bad_status'
            | 'network'
            | 'timeout'
    ) {
        super(message);
        this.name = 'FbmEntitlementsServiceError';
    }
}

const jitter = (ms: number): number => ms + Math.floor((Math.random() - 0.5) * 100);

export interface FbmEntitlementsHttpClientOptions {
    baseUrl: string;
    serviceToken: string;
    /** Injectable for tests; defaults to global fetch. */
    fetchImpl?: typeof fetch;
    /** Injectable clock for breaker tests. */
    now?: () => number;
}

export class FbmEntitlementsHttpClient implements FbmEntitlementsClient {
    private readonly baseUrl: string;
    private readonly serviceToken: string;
    private readonly fetchImpl: typeof fetch;
    private readonly now: () => number;
    private consecutiveFailures = 0;
    private breakerOpenedAt: number | null = null;

    constructor(opts: FbmEntitlementsHttpClientOptions) {
        this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
        this.serviceToken = opts.serviceToken;
        this.fetchImpl = opts.fetchImpl ?? fetch;
        this.now = opts.now ?? Date.now;
    }

    private breakerOpen(): boolean {
        if (this.breakerOpenedAt === null) return false;
        if (this.now() - this.breakerOpenedAt >= BREAKER_COOLDOWN_MS) {
            // half-open: allow a probe; success/failure updates state below.
            return false;
        }
        return true;
    }

    private recordSuccess(): void {
        this.consecutiveFailures = 0;
        this.breakerOpenedAt = null;
    }

    private recordFailure(): void {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= BREAKER_THRESHOLD) {
            this.breakerOpenedAt = this.now();
        }
    }

    private async request<T>(
        path: string,
        init: RequestInit & { idempotent?: boolean } = {}
    ): Promise<T> {
        if (this.breakerOpen()) {
            throw new FbmEntitlementsServiceError('entitlements circuit open', 'circuit_open');
        }
        const url = `${this.baseUrl}${path}`;
        let lastErr: FbmEntitlementsServiceError | null = null;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS + READ_TIMEOUT_MS);
            try {
                const res = await this.fetchImpl(url, {
                    ...init,
                    signal: controller.signal,
                    headers: {
                        accept: 'application/json',
                        authorization: `Bearer ${this.serviceToken}`,
                        ...(init.body ? { 'content-type': 'application/json' } : {}),
                        ...(init.headers ?? {}),
                    },
                });
                if (res.ok) {
                    this.recordSuccess();
                    return (await res.json()) as T;
                }
                // 4xx are terminal (no retry); 5xx are retryable.
                if (res.status === 401) throw new FbmEntitlementsServiceError('unauthorized', 'unauthorized');
                if (res.status === 403) throw new FbmEntitlementsServiceError('forbidden', 'forbidden');
                if (res.status === 404) throw new FbmEntitlementsServiceError('not found', 'not_found');
                if (res.status < 500) {
                    throw new FbmEntitlementsServiceError(`bad status ${res.status}`, 'bad_status');
                }
                lastErr = new FbmEntitlementsServiceError(`server error ${res.status}`, 'bad_status');
            } catch (err) {
                if (err instanceof FbmEntitlementsServiceError && err.code !== 'bad_status') {
                    // terminal 4xx — count as failure for the breaker, do not retry.
                    this.recordFailure();
                    throw err;
                }
                const aborted = (err as Error)?.name === 'AbortError';
                lastErr =
                    err instanceof FbmEntitlementsServiceError
                        ? err
                        : new FbmEntitlementsServiceError(
                              aborted ? 'timeout' : `network: ${(err as Error).message}`,
                              aborted ? 'timeout' : 'network'
                          );
            } finally {
                clearTimeout(timer);
            }
            if (attempt < MAX_ATTEMPTS - 1) {
                await new Promise((r) => setTimeout(r, jitter(BACKOFFS_MS[attempt] ?? 600)));
            }
        }
        this.recordFailure();
        throw lastErr ?? new FbmEntitlementsServiceError('exhausted retries', 'network');
    }

    private enc(mxid: Mxid): string {
        return encodeURIComponent(mxid);
    }

    async checkAccess(mxid: Mxid, request: AccessCheckRequest): Promise<AccessCheckResult> {
        const qs = new URLSearchParams({ urn: request.urn, action: request.action });
        return this.request<AccessCheckResult>(
            `/entitlements/access/${this.enc(mxid)}?${qs.toString()}`
        );
    }

    async checkAccessBatch(
        mxid: Mxid,
        requests: AccessCheckRequest[]
    ): Promise<AccessCheckResult[]> {
        return this.request<AccessCheckResult[]>(`/entitlements/access-batch/${this.enc(mxid)}`, {
            method: 'POST',
            body: JSON.stringify({ checks: requests }),
        });
    }

    async getEconomicStanding(mxid: Mxid): Promise<EconomicStanding> {
        return this.request<EconomicStanding>(`/entitlements/economic-standing/${this.enc(mxid)}`);
    }

    async getGovernanceRoles(mxid: Mxid): Promise<GovernanceRole[]> {
        const body = await this.request<{ roles: GovernanceRole[] }>(
            `/entitlements/governance-roles/${this.enc(mxid)}`
        );
        return body.roles ?? [];
    }

    async getCoalitionMemberships(mxid: Mxid): Promise<CoalitionMembership[]> {
        const body = await this.request<{ memberships: CoalitionMembership[] }>(
            `/entitlements/coalitions/${this.enc(mxid)}`
        );
        return body.memberships ?? [];
    }

    async getSummary(mxid: Mxid): Promise<EntitlementsSummary> {
        return this.request<EntitlementsSummary>(`/entitlements/summary/${this.enc(mxid)}`);
    }
}
