import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import {
    canStart,
    canStop,
    getFanoutStatus,
    isStatusActive,
    listFanouts,
    startFanout,
    statusLabel,
    stopFanout,
    subscribeFanoutStream,
    type FanoutStreamFrame,
} from '../../../../../src/app/features/settings/simulcast-destinations/rtmpFanoutClient';

const collectClient = () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const apiClient = createFetchApiClient({
        baseUrl: 'http://localhost:0',
        fetchFn: (async (url: RequestInfo | URL, init?: RequestInit) => {
            const u = typeof url === 'string' ? url : url.toString();
            calls.push({
                method: init?.method ?? 'GET',
                path: u.replace('http://localhost:0', ''),
                body: init?.body ? JSON.parse(String(init.body)) : undefined,
            });
            return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
        }) as unknown as typeof fetch,
    });
    return { apiClient, calls };
};

describe('rtmpFanoutClient: wire contracts', () => {
    it('listFanouts → GET /v1/integrations/simulcast/fanout', async () => {
        const { apiClient, calls } = collectClient();
        await listFanouts({ apiClient });
        expect(calls).toEqual([
            { method: 'GET', path: '/v1/integrations/simulcast/fanout', body: undefined },
        ]);
    });

    it('getFanoutStatus → GET /:id/status with the id URI-encoded', async () => {
        const { apiClient, calls } = collectClient();
        await getFanoutStatus('abc/123', { apiClient });
        expect(calls).toEqual([
            {
                method: 'GET',
                path: '/v1/integrations/simulcast/fanout/abc%2F123/status',
                body: undefined,
            },
        ]);
    });

    it('startFanout → POST /:id/start', async () => {
        const { apiClient, calls } = collectClient();
        await startFanout('dst-1', { apiClient });
        expect(calls).toEqual([
            { method: 'POST', path: '/v1/integrations/simulcast/fanout/dst-1/start', body: undefined },
        ]);
    });

    it('stopFanout → POST /:id/stop', async () => {
        const { apiClient, calls } = collectClient();
        await stopFanout('dst-2', { apiClient });
        expect(calls).toEqual([
            { method: 'POST', path: '/v1/integrations/simulcast/fanout/dst-2/stop', body: undefined },
        ]);
    });
});

describe('rtmpFanoutClient.statusLabel', () => {
    it('maps every status to a human label', () => {
        expect(statusLabel('idle')).toBe('Idle');
        expect(statusLabel('starting')).toBe('Starting…');
        expect(statusLabel('running')).toBe('Live');
        expect(statusLabel('restarting')).toBe('Restarting');
        expect(statusLabel('stopped')).toBe('Stopped');
        expect(statusLabel('failed')).toBe('Failed');
    });
});

describe('rtmpFanoutClient.isStatusActive', () => {
    it('true while the supervisor is keeping the stream up', () => {
        expect(isStatusActive('starting')).toBe(true);
        expect(isStatusActive('running')).toBe(true);
        expect(isStatusActive('restarting')).toBe(true);
    });
    it('false when stopped, idle, or failed', () => {
        expect(isStatusActive('idle')).toBe(false);
        expect(isStatusActive('stopped')).toBe(false);
        expect(isStatusActive('failed')).toBe(false);
    });
});

describe('rtmpFanoutClient.subscribeFanoutStream', () => {
    /**
     * Build a fake fetch that returns a streaming response feeding `chunks`
     * to the parser, each as a separate `Uint8Array`. The fetch resolves
     * once the AbortSignal fires so the consumer's await-loop terminates.
     */
    const buildStreamingFetch = (chunks: string[]): typeof fetch => {
        return (async (_url: RequestInfo | URL, init?: RequestInit) => {
            const encoder = new TextEncoder();
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    for (const c of chunks) controller.enqueue(encoder.encode(c));
                    // Hold the stream open until aborted.
                    init?.signal?.addEventListener('abort', () => controller.close());
                },
            });
            return new Response(stream, {
                status: 200,
                headers: { 'content-type': 'text/event-stream' },
            });
        }) as unknown as typeof fetch;
    };

    it('parses connected + status + keepalive frames and dispatches to onFrame', async () => {
        const frames: FanoutStreamFrame[] = [];
        const dispose = subscribeFanoutStream({
            token: 'test-token',
            baseUrl: 'http://x',
            fetchFn: buildStreamingFetch([
                'event: connected\ndata: {"ok":true,"snapshots":[]}\n\n',
                'event: status\ndata: {"destinationId":"d1","blackoutUserId":"u1","status":"running","restartCount":0}\n\n',
                'event: keepalive\ndata: \n\n',
                'event: status\ndata: {"destinationId":"d1","blackoutUserId":"u1","status":"failed","restartCount":5}\n\n',
            ]),
            onFrame: (f) => frames.push(f),
        });
        // Give the async run() a few microtask ticks to drain the stream.
        for (let i = 0; i < 20 && frames.length < 4; i++) {
            await new Promise((r) => setImmediate(r));
        }
        expect(frames.length).toBe(4);
        expect(frames[0].event).toBe('connected');
        expect(frames[1].event).toBe('status');
        expect(frames[1].event === 'status' && frames[1].data.status).toBe('running');
        expect(frames[2].event).toBe('keepalive');
        expect(frames[3].event === 'status' && frames[3].data.restartCount).toBe(5);
        dispose();
    });

    it('handles SSE comments (lines starting with `:`) and split chunks across frame boundaries', async () => {
        const frames: FanoutStreamFrame[] = [];
        const dispose = subscribeFanoutStream({
            token: 'test-token',
            baseUrl: 'http://x',
            // Frame split arbitrarily across chunks; comment line should be ignored.
            fetchFn: buildStreamingFetch([
                ':keepalive-comment\nevent: status\ndata: {"destinationId',
                '":"d2","blackoutUserId":"u","status":"starting"',
                ',"restartCount":0}\n\n',
            ]),
            onFrame: (f) => frames.push(f),
        });
        for (let i = 0; i < 20 && frames.length < 1; i++) {
            await new Promise((r) => setImmediate(r));
        }
        expect(frames.length).toBe(1);
        expect(frames[0].event === 'status' && frames[0].data.destinationId).toBe('d2');
        dispose();
    });

    it('drops malformed frames (bad JSON, missing event) without throwing', async () => {
        const frames: FanoutStreamFrame[] = [];
        let errored = false;
        const dispose = subscribeFanoutStream({
            token: 'test-token',
            baseUrl: 'http://x',
            fetchFn: buildStreamingFetch([
                // bad JSON
                'event: status\ndata: {bad json\n\n',
                // missing event
                'data: {"foo":1}\n\n',
                // good frame still flows
                'event: status\ndata: {"destinationId":"d3","blackoutUserId":"u","status":"running","restartCount":0}\n\n',
            ]),
            onFrame: (f) => frames.push(f),
            onError: () => {
                errored = true;
            },
        });
        for (let i = 0; i < 20 && frames.length < 1; i++) {
            await new Promise((r) => setImmediate(r));
        }
        expect(errored).toBe(false);
        expect(frames.length).toBe(1);
        expect(frames[0].event === 'status' && frames[0].data.destinationId).toBe('d3');
        dispose();
    });
});

describe('rtmpFanoutClient.canStart / canStop', () => {
    it('canStart shows the button for idle / stopped / failed and when status is undefined', () => {
        expect(canStart(undefined)).toBe(true);
        expect(canStart('idle')).toBe(true);
        expect(canStart('stopped')).toBe(true);
        expect(canStart('failed')).toBe(true);
        expect(canStart('starting')).toBe(false);
        expect(canStart('running')).toBe(false);
        expect(canStart('restarting')).toBe(false);
    });
    it('canStop shows the button for active states only', () => {
        expect(canStop(undefined)).toBe(false);
        expect(canStop('idle')).toBe(false);
        expect(canStop('stopped')).toBe(false);
        expect(canStop('failed')).toBe(false);
        expect(canStop('starting')).toBe(true);
        expect(canStop('running')).toBe(true);
        expect(canStop('restarting')).toBe(true);
    });
});
