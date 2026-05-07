import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers for /v1/integrations/simulcast/fanout. Mirrors
 * packages/api/src/routes/rtmpFanout.ts.
 *
 * The fanout endpoints expose RUNTIME state of the per-destination
 * ffmpeg supervisor — distinct from the destinations CRUD at
 * /v1/integrations/simulcast/destinations which manages CONFIG only.
 * The Settings UI displays both: config rows for editability +
 * runtime snapshots for observability.
 */

export type FanoutStatus =
    | 'idle'
    | 'starting'
    | 'running'
    | 'restarting'
    | 'stopped'
    | 'failed';

export interface FanoutSnapshot {
    destinationId: string;
    blackoutUserId: string;
    status: FanoutStatus;
    restartCount: number;
    lastError?: string;
    lastStartedAt?: number;
    lastExitedAt?: number;
    lastExitCode?: number | null;
}

export interface ListFanoutsResponse {
    fanouts: FanoutSnapshot[];
}

export interface FanoutStatusResponse {
    status: FanoutSnapshot | { destinationId: string; status: 'idle' };
}

export interface StartStopResponse {
    ok: boolean;
    status: FanoutSnapshot | undefined;
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/integrations/simulcast/fanout';

export const listFanouts = (options?: ApiCallOptions): Promise<ListFanoutsResponse> =>
    client(options)({ method: 'GET', path: BASE }) as Promise<ListFanoutsResponse>;

export const getFanoutStatus = (
    destinationId: string,
    options?: ApiCallOptions,
): Promise<FanoutStatusResponse> =>
    client(options)({
        method: 'GET',
        path: `${BASE}/${encodeURIComponent(destinationId)}/status`,
    }) as Promise<FanoutStatusResponse>;

export const startFanout = (
    destinationId: string,
    options?: ApiCallOptions,
): Promise<StartStopResponse> =>
    client(options)({
        method: 'POST',
        path: `${BASE}/${encodeURIComponent(destinationId)}/start`,
    }) as Promise<StartStopResponse>;

export const stopFanout = (
    destinationId: string,
    options?: ApiCallOptions,
): Promise<StartStopResponse> =>
    client(options)({
        method: 'POST',
        path: `${BASE}/${encodeURIComponent(destinationId)}/stop`,
    }) as Promise<StartStopResponse>;

// ----------------------------- helpers --------------------------------------

/** Maps a status to a short, human-friendly label for the UI badge. */
export const statusLabel = (status: FanoutStatus): string => {
    switch (status) {
        case 'idle':
            return 'Idle';
        case 'starting':
            return 'Starting…';
        case 'running':
            return 'Live';
        case 'restarting':
            return 'Restarting';
        case 'stopped':
            return 'Stopped';
        case 'failed':
            return 'Failed';
        default: {
            const exhaustive: never = status;
            return String(exhaustive);
        }
    }
};

/** Returns true when the supervisor is actively trying to keep the stream up. */
export const isStatusActive = (status: FanoutStatus): boolean =>
    status === 'starting' || status === 'running' || status === 'restarting';

/** True when a fresh "Start" button should be visible to the creator. */
export const canStart = (status: FanoutStatus | undefined): boolean =>
    status === undefined ||
    status === 'idle' ||
    status === 'stopped' ||
    status === 'failed';

/** True when a "Stop" button should be visible. */
export const canStop = (status: FanoutStatus | undefined): boolean =>
    status === 'starting' || status === 'running' || status === 'restarting';
