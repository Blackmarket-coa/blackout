import type {
    FederationAlertSeverity,
    FederationAlertStatusEvent,
    FederationAlertStatusPayload,
    RevenueOpsSnapshotEvent,
    RevenueOpsSnapshotPayload,
    TownhallLifecycleEvent,
    TownhallLifecyclePayload,
    TownhallLifecyclePhase,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export type FederationHealthResponse = {
    /** Subject the response applies to. */
    subject: string;
    /** Active (unresolved) alerts. Resolved alerts are pruned server-side. */
    alerts: FederationAlertStatusPayload[];
};

export type TownhallListResponse = {
    subject: string;
    townhalls: TownhallLifecyclePayload[];
};

export type RevenueOpsListResponse = {
    subject: string;
    snapshots: RevenueOpsSnapshotPayload[];
};

export const createFederatedOpsActions = (client: ApiClient) => ({
    /**
     * Fetch the current federation alert set. Backed by
     * `GET /v1/federation/alerts`. Returns active alerts only.
     */
    listAlerts: () =>
        client<FederationHealthResponse>({
            method: 'GET',
            path: '/v1/federation/alerts',
        }),
    /**
     * Acknowledge an alert. Server emits a
     * `blackout.federation.alert.status` envelope with `active: false`.
     */
    acknowledgeAlert: (alertId: string) =>
        client<FederationAlertStatusEvent>({
            method: 'POST',
            path: `/v1/federation/alerts/${encodeURIComponent(alertId)}/acknowledge`,
            body: {},
        }),
    /**
     * Fetch the townhall directory. Backed by `GET /v1/townhalls`.
     */
    listTownhalls: () =>
        client<TownhallListResponse>({
            method: 'GET',
            path: '/v1/townhalls',
        }),
    /**
     * Transition a townhall into a new phase. Server emits a
     * `blackout.townhall.lifecycle` envelope. The `cancellationReason` is
     * forwarded only when phase is `cancelled`; the SDK strips it
     * otherwise to avoid sending stale reasons on re-transitions.
     */
    transitionTownhall: (
        townhallId: string,
        input: { phase: TownhallLifecyclePhase; cancellationReason?: string }
    ) =>
        client<TownhallLifecycleEvent>({
            method: 'POST',
            path: `/v1/townhalls/${encodeURIComponent(townhallId)}/transition`,
            body:
                input.phase === 'cancelled'
                    ? input
                    : { phase: input.phase },
        }),
    /**
     * Fetch the latest revenue ops snapshot.
     */
    getRevenueSnapshot: () =>
        client<RevenueOpsSnapshotPayload>({
            method: 'GET',
            path: '/v1/revenue/ops/snapshot',
        }),
    /**
     * Fetch a window of historical revenue snapshots. Cursor + limit
     * pagination; non-positive limits are dropped.
     */
    listRevenueSnapshots: (options: { cursor?: string; limit?: number } = {}) => {
        const params: string[] = [];
        if (options.cursor) params.push(`cursor=${encodeURIComponent(options.cursor)}`);
        if (typeof options.limit === 'number' && options.limit > 0) {
            params.push(`limit=${options.limit | 0}`);
        }
        const query = params.length ? `?${params.join('&')}` : '';
        return client<RevenueOpsListResponse>({
            method: 'GET',
            path: `/v1/revenue/ops/snapshots${query}`,
        });
    },
    /**
     * Publish a new revenue snapshot. Server emits a
     * `blackout.revenue.ops.snapshot` envelope.
     */
    publishRevenueSnapshot: (
        input: Omit<RevenueOpsSnapshotPayload, 'snapshotId' | 'capturedAt'>
    ) =>
        client<RevenueOpsSnapshotEvent>({
            method: 'POST',
            path: '/v1/revenue/ops/snapshots',
            body: input,
        }),
});

/**
 * Pure helper: severity-rank → numeric. Mirrors the federation health
 * panel's sort order (critical first). Returns `Infinity` for unknown
 * severities so they sort to the bottom rather than throwing.
 */
export const compareFederationSeverity = (
    a: FederationAlertSeverity,
    b: FederationAlertSeverity
): number => {
    const order: Record<FederationAlertSeverity, number> = {
        critical: 0,
        warning: 1,
        info: 2,
    };
    const left = order[a] ?? Number.POSITIVE_INFINITY;
    const right = order[b] ?? Number.POSITIVE_INFINITY;
    return left - right;
};

/**
 * Pure helper: derives the next phase from a lifecycle envelope, used by
 * the canonical client to drive UI state transitions deterministically
 * without round-tripping through the server.
 */
export const applyTownhallLifecycle = (
    snapshot: TownhallLifecyclePayload,
    payload: TownhallLifecyclePayload
): TownhallLifecyclePayload => {
    if (payload.townhallId !== snapshot.townhallId) return snapshot;
    return { ...snapshot, ...payload };
};

export type {
    FederationAlertSeverity,
    FederationAlertStatusEvent,
    FederationAlertStatusPayload,
    RevenueOpsSnapshotEvent,
    RevenueOpsSnapshotPayload,
    TownhallLifecycleEvent,
    TownhallLifecyclePayload,
    TownhallLifecyclePhase,
};
