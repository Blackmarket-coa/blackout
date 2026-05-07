import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import { syncStreamlabsDonations } from '../../../../../src/app/features/settings/streamlabs/streamlabsClient';

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

describe('streamlabsClient.syncStreamlabsDonations', () => {
    it('POST /v1/integrations/streamlabs/sync with no body', async () => {
        const { apiClient, calls } = collectClient();
        await syncStreamlabsDonations({ apiClient });
        expect(calls).toEqual([
            { method: 'POST', path: '/v1/integrations/streamlabs/sync', body: undefined },
        ]);
    });
});
