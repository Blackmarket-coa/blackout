import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import {
    ALL_OUTBOUND_EVENT_TYPES,
    deleteSubscription,
    isValidEventTypeSelection,
    isValidName,
    isValidTargetUrl,
    listSubscriptions,
    registerSubscription,
    testDeliver,
} from '../../../../../src/app/features/settings/outbound-event-webhooks/outboundEventWebhooksClient';

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

describe('outboundEventWebhooksClient: wire contracts', () => {
    it('listSubscriptions → GET /v1/integrations/outbound-webhooks', async () => {
        const { apiClient, calls } = collectClient();
        await listSubscriptions({ apiClient });
        expect(calls).toEqual([
            { method: 'GET', path: '/v1/integrations/outbound-webhooks', body: undefined },
        ]);
    });

    it('registerSubscription → POST with the typed body', async () => {
        const { apiClient, calls } = collectClient();
        await registerSubscription(
            {
                name: 'My Discord channel',
                targetUrl: 'https://discord.com/api/webhooks/1/x',
                eventTypes: ['tip.created', 'follow.created'],
            },
            { apiClient },
        );
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/outbound-webhooks',
                body: {
                    name: 'My Discord channel',
                    targetUrl: 'https://discord.com/api/webhooks/1/x',
                    eventTypes: ['tip.created', 'follow.created'],
                },
            },
        ]);
    });

    it('deleteSubscription → DELETE /:id with the id URI-encoded', async () => {
        const { apiClient, calls } = collectClient();
        await deleteSubscription('abc/123', { apiClient });
        expect(calls).toEqual([
            {
                method: 'DELETE',
                path: '/v1/integrations/outbound-webhooks/abc%2F123',
                body: undefined,
            },
        ]);
    });

    it('testDeliver → POST /:id/test with event + data in body (server holds the secret)', async () => {
        const { apiClient, calls } = collectClient();
        await testDeliver(
            'sub-1',
            { eventType: 'tip.created', data: { amount: 100 } },
            { apiClient },
        );
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/outbound-webhooks/sub-1/test',
                body: { eventType: 'tip.created', data: { amount: 100 } },
            },
        ]);
    });
});

describe('outboundEventWebhooksClient.isValidName', () => {
    it('accepts non-empty trimmed names up to 80 chars', () => {
        expect(isValidName('Discord channel')).toBe(true);
        expect(isValidName('A'.repeat(80))).toBe(true);
    });
    it('rejects empty / overlong', () => {
        expect(isValidName('')).toBe(false);
        expect(isValidName('   ')).toBe(false);
        expect(isValidName('A'.repeat(81))).toBe(false);
    });
});

describe('outboundEventWebhooksClient.isValidTargetUrl', () => {
    it('accepts public http(s) URLs', () => {
        expect(isValidTargetUrl('https://discord.com/api/webhooks/1/x')).toBe(true);
        expect(isValidTargetUrl('http://example.com/x')).toBe(true);
        expect(isValidTargetUrl('https://hooks.zapier.com/abc')).toBe(true);
    });
    it('rejects malformed / non-http / SSRF targets / overlong', () => {
        expect(isValidTargetUrl('')).toBe(false);
        expect(isValidTargetUrl('not-a-url')).toBe(false);
        expect(isValidTargetUrl('ftp://x/y')).toBe(false);
        expect(isValidTargetUrl('http://localhost/x')).toBe(false);
        expect(isValidTargetUrl('http://127.0.0.1/x')).toBe(false);
        expect(isValidTargetUrl('http://server.local/x')).toBe(false);
        expect(isValidTargetUrl('http://server.internal/x')).toBe(false);
        expect(isValidTargetUrl(`https://example.com/${'a'.repeat(2050)}`)).toBe(false);
    });
});

describe('outboundEventWebhooksClient.isValidEventTypeSelection', () => {
    it('accepts empty selection (means all) and any subset of known types', () => {
        expect(isValidEventTypeSelection([])).toBe(true);
        expect(isValidEventTypeSelection(['tip.created'])).toBe(true);
        expect(isValidEventTypeSelection(ALL_OUTBOUND_EVENT_TYPES)).toBe(true);
    });
    it('rejects unknown event types', () => {
        expect(isValidEventTypeSelection(['nonsense'])).toBe(false);
        expect(isValidEventTypeSelection(['tip.created', 'nonsense'])).toBe(false);
    });
});
