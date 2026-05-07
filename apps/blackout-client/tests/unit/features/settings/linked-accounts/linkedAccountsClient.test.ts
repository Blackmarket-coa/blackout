import { describe, expect, it } from 'vitest';
import {
    IMPLEMENTED_PROVIDERS,
    beginConnect,
    completeCallback,
    listLinkedAccounts,
    parseCallbackUrl,
    unlinkAccount,
} from '../../../../../src/app/features/settings/linked-accounts/linkedAccountsClient';
import { createFetchApiClient } from '@blackout/sdk';

/**
 * The client wrappers in linkedAccountsClient.ts are thin: their job is to
 * shape the right URL, method, and body. We verify that contract by
 * injecting a stub ApiClient and asserting the wire calls.
 */
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

describe('linkedAccountsClient: wire contracts', () => {
    it('listLinkedAccounts → GET /v1/linked-accounts', async () => {
        const { apiClient, calls } = collectClient();
        await listLinkedAccounts({ apiClient });
        expect(calls).toEqual([{ method: 'GET', path: '/v1/linked-accounts', body: undefined }]);
    });

    it('beginConnect → POST /v1/linked-accounts/twitch/connect with empty body', async () => {
        const { apiClient, calls } = collectClient();
        await beginConnect('twitch', { apiClient });
        expect(calls).toEqual([{ method: 'POST', path: '/v1/linked-accounts/twitch/connect', body: {} }]);
    });

    it('completeCallback → POST /v1/linked-accounts/discord/callback with {code, state}', async () => {
        const { apiClient, calls } = collectClient();
        await completeCallback('discord', { code: 'c', state: 's' }, { apiClient });
        expect(calls).toEqual([
            { method: 'POST', path: '/v1/linked-accounts/discord/callback', body: { code: 'c', state: 's' } },
        ]);
    });

    it('unlinkAccount → DELETE /v1/linked-accounts/patreon', async () => {
        const { apiClient, calls } = collectClient();
        await unlinkAccount('patreon', { apiClient });
        expect(calls).toEqual([{ method: 'DELETE', path: '/v1/linked-accounts/patreon', body: undefined }]);
    });

    it('IMPLEMENTED_PROVIDERS matches the server dispatch table', () => {
        // If the server adds youtube/tiktok/kick, this test should be updated to
        // match — keeping it strict prevents UI from claiming "Coming soon" on
        // a provider that already works.
        expect([...IMPLEMENTED_PROVIDERS].sort()).toEqual(['discord', 'patreon', 'twitch']);
    });
});

describe('linkedAccountsClient.parseCallbackUrl', () => {
    it('extracts code + state from a well-formed redirect URL', () => {
        const out = parseCallbackUrl(
            'http://localhost:3000/oauth/twitch/callback?code=abc123&state=xyz789&scope=user:read',
        );
        expect(out).toEqual({ code: 'abc123', state: 'xyz789' });
    });

    it('trims surrounding whitespace before parsing', () => {
        const out = parseCallbackUrl('  https://example.com/cb?code=A&state=B  ');
        expect(out).toEqual({ code: 'A', state: 'B' });
    });

    it('returns the OAuth error envelope when the provider sent an error param', () => {
        const out = parseCallbackUrl(
            'http://x/cb?error=access_denied&error_description=User+rejected',
        );
        expect(out).toEqual({ error: 'access_denied', description: 'User rejected' });
    });

    it('returns null when neither code nor error are present', () => {
        expect(parseCallbackUrl('http://x/cb?state=only')).toBeNull();
    });

    it('returns null on malformed input', () => {
        expect(parseCallbackUrl('not a url')).toBeNull();
        expect(parseCallbackUrl('')).toBeNull();
    });
});
