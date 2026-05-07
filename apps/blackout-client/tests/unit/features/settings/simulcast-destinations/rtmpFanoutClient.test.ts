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
