import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import { fetchIntegrationsHealth } from '../../../../../src/app/features/settings/integrations-health/integrationsHealthClient';

describe('integrationsHealthClient.fetchIntegrationsHealth', () => {
    it('GET /v1/integrations/health and returns the parsed snapshot', async () => {
        const calls: Array<{ method: string; path: string }> = [];
        const apiClient = createFetchApiClient({
            baseUrl: 'http://localhost:0',
            fetchFn: (async (url: RequestInfo | URL, init?: RequestInit) => {
                const u = typeof url === 'string' ? url : url.toString();
                calls.push({
                    method: init?.method ?? 'GET',
                    path: u.replace('http://localhost:0', ''),
                });
                return new Response(
                    JSON.stringify({
                        generatedAtMs: 1700000000000,
                        linkedAccounts: [],
                        twitchChatBridges: [],
                        youtubeChatBridges: [],
                        twitchEventSubscriptions: [],
                        widgetAlertTokens: [],
                        patreon: { linked: false, webhookSecretConfigured: false },
                        streamlabs: { linked: false, autosyncRunning: false },
                        schedulers: {
                            youtubeChatRunning: false,
                            streamlabsDonationsRunning: false,
                        },
                    }),
                    { status: 200, headers: { 'content-type': 'application/json' } },
                );
            }) as unknown as typeof fetch,
        });
        const snap = await fetchIntegrationsHealth({ apiClient });
        expect(calls).toEqual([{ method: 'GET', path: '/v1/integrations/health' }]);
        expect(snap.generatedAtMs).toBe(1700000000000);
        expect(snap.linkedAccounts).toEqual([]);
    });
});
