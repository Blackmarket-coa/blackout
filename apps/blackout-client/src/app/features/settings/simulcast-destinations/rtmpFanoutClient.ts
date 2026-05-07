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

// --------------------------- live status (SSE) ------------------------------

/**
 * Frame shapes the /fanout/stream endpoint emits. `connected` is sent
 * once on subscribe with the current snapshots so the consumer doesn't
 * need a separate listFanouts() call on mount. `status` fires per
 * supervisor state transition. `keepalive` is a no-op heartbeat used
 * to keep reverse proxies from idle-disconnecting.
 */
export type FanoutStreamFrame =
    | { event: 'connected'; data: { ok: boolean; snapshots: FanoutSnapshot[] } }
    | { event: 'status'; data: FanoutSnapshot }
    | { event: 'keepalive'; data: string };

export interface SubscribeStreamOptions {
    /** Bearer token. Required because EventSource can't send Authorization. */
    token: string;
    /** Override fetch (tests use this). */
    fetchFn?: typeof fetch;
    /** Override the API base. Defaults to the same origin. */
    baseUrl?: string;
    /** Per-frame callback. Failures are swallowed. */
    onFrame: (frame: FanoutStreamFrame) => void;
    /** Optional terminal-error callback (network blew up). */
    onError?: (err: Error) => void;
}

/**
 * Open a Server-Sent Events connection to /fanout/stream and dispatch
 * frames into `onFrame` until the returned disposer is called.
 *
 * Browser EventSource doesn't support custom Authorization headers, so
 * we use `fetch` with a streaming body and a tiny line-based SSE
 * parser instead. The parser yields one `{event, data}` per double-
 * newline-delimited block, matching the wire format.
 */
export const subscribeFanoutStream = (options: SubscribeStreamOptions): (() => void) => {
    const fetchFn = options.fetchFn ?? fetch;
    const base =
        options.baseUrl ??
        (typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : '');
    const url = `${base}${BASE}/stream`;
    const ctrl = new AbortController();

    const run = async (): Promise<void> => {
        let response: Response;
        try {
            response = await fetchFn(url, {
                method: 'GET',
                headers: { authorization: `Bearer ${options.token}`, accept: 'text/event-stream' },
                signal: ctrl.signal,
            });
        } catch (err) {
            if (!ctrl.signal.aborted) options.onError?.(err as Error);
            return;
        }
        if (!response.ok || !response.body) {
            options.onError?.(new Error(`fanout stream HTTP ${response.status}`));
            return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let cut: number;
                // SSE separates events by a blank line (\n\n).
                while ((cut = buf.indexOf('\n\n')) >= 0) {
                    const block = buf.slice(0, cut);
                    buf = buf.slice(cut + 2);
                    const frame = parseSseBlock(block);
                    if (frame) {
                        try {
                            options.onFrame(frame);
                        } catch {
                            // ignore consumer errors
                        }
                    }
                }
            }
        } catch (err) {
            if (!ctrl.signal.aborted) options.onError?.(err as Error);
        }
    };

    void run();
    return () => ctrl.abort();
};

const parseSseBlock = (block: string): FanoutStreamFrame | null => {
    let event: string | undefined;
    let data = '';
    for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue; // SSE comment
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trimStart();
    }
    if (!event) return null;
    if (event === 'keepalive') return { event: 'keepalive', data };
    let parsed: unknown;
    try {
        parsed = JSON.parse(data || 'null');
    } catch {
        return null;
    }
    if (event === 'connected' && parsed && typeof parsed === 'object') {
        return { event: 'connected', data: parsed as FanoutStreamFrame extends { event: 'connected'; data: infer D } ? D : never };
    }
    if (event === 'status' && parsed && typeof parsed === 'object') {
        return { event: 'status', data: parsed as FanoutSnapshot };
    }
    return null;
};
