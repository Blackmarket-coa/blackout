import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import {
    buildSseUrl,
    createToken,
    listTokens,
    revokeToken,
    sendTestAlert,
} from '../../../../../src/app/features/settings/widget-alerts/widgetAlertsClient';

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

describe('widgetAlertsClient: wire contracts', () => {
    it('listTokens → GET /v1/integrations/widgets/alerts/tokens', async () => {
        const { apiClient, calls } = collectClient();
        await listTokens({ apiClient });
        expect(calls).toEqual([
            { method: 'GET', path: '/v1/integrations/widgets/alerts/tokens', body: undefined },
        ]);
    });

    it('createToken → POST with the {label} body', async () => {
        const { apiClient, calls } = collectClient();
        await createToken({ label: 'Main OBS' }, { apiClient });
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/widgets/alerts/tokens',
                body: { label: 'Main OBS' },
            },
        ]);
    });

    it('createToken with no label sends an empty body', async () => {
        const { apiClient, calls } = collectClient();
        await createToken({}, { apiClient });
        expect(calls).toEqual([
            { method: 'POST', path: '/v1/integrations/widgets/alerts/tokens', body: {} },
        ]);
    });

    it('sendTestAlert → POST /test with the typed body', async () => {
        const { apiClient, calls } = collectClient();
        await sendTestAlert(
            { type: 'cheer', name: 'TestUser', amount: 500, message: 'Cheer500' },
            { apiClient },
        );
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/widgets/alerts/test',
                body: { type: 'cheer', name: 'TestUser', amount: 500, message: 'Cheer500' },
            },
        ]);
    });

    it('sendTestAlert allows the minimal body shape (just type)', async () => {
        const { apiClient, calls } = collectClient();
        await sendTestAlert({ type: 'follow' }, { apiClient });
        expect(calls).toEqual([
            { method: 'POST', path: '/v1/integrations/widgets/alerts/test', body: { type: 'follow' } },
        ]);
    });

    it('revokeToken → DELETE /:id with URI-encoded id', async () => {
        const { apiClient, calls } = collectClient();
        await revokeToken('abc/123', { apiClient });
        expect(calls).toEqual([
            {
                method: 'DELETE',
                path: '/v1/integrations/widgets/alerts/tokens/abc%2F123',
                body: undefined,
            },
        ]);
    });
});

describe('widgetAlertsClient.buildSseUrl', () => {
    it('builds an absolute URL when a baseUrl is supplied', () => {
        expect(
            buildSseUrl('the-secret', { baseUrl: 'https://api.blackout.example' }),
        ).toBe(
            'https://api.blackout.example/v1/integrations/widgets/alerts/stream?token=the-secret',
        );
    });

    it('handles a baseUrl that already ends with a slash', () => {
        expect(buildSseUrl('s', { baseUrl: 'https://api.blackout.example/' })).toBe(
            'https://api.blackout.example/v1/integrations/widgets/alerts/stream?token=s',
        );
    });

    it('falls back to a relative path when no baseUrl is configured', () => {
        expect(buildSseUrl('s', { baseUrl: '' })).toBe(
            '/v1/integrations/widgets/alerts/stream?token=s',
        );
    });

    it('URI-encodes secrets containing reserved characters', () => {
        // base64url uses [A-Za-z0-9_-]; defense-in-depth still matters in
        // case the server's secret format ever widens to include `+` `/` `=`.
        const url = buildSseUrl('a+b/c=d', { baseUrl: 'https://x.test' });
        // Either %2B%2F%3D or just %3D depending on whether the test runs
        // with a recent encodeURIComponent — both are valid encodings here.
        expect(url).toContain('a%2Bb%2Fc%3Dd');
    });
});
