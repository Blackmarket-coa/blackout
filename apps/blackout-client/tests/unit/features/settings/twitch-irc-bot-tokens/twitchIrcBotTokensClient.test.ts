import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import {
    isValidLabel,
    isValidScopeEntry,
    listSessions,
    listTokens,
    mintToken,
    revokeToken,
} from '../../../../../src/app/features/settings/twitch-irc-bot-tokens/twitchIrcBotTokensClient';

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

describe('twitchIrcBotTokensClient: wire contracts', () => {
    it('listTokens → GET /v1/integrations/twitch-compat/bot-tokens', async () => {
        const { apiClient, calls } = collectClient();
        await listTokens({ apiClient });
        expect(calls).toEqual([
            { method: 'GET', path: '/v1/integrations/twitch-compat/bot-tokens', body: undefined },
        ]);
    });

    it('mintToken → POST with the typed body', async () => {
        const { apiClient, calls } = collectClient();
        await mintToken({ label: 'Nightbot', scopes: ['#room1', '#room2'] }, { apiClient });
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/twitch-compat/bot-tokens',
                body: { label: 'Nightbot', scopes: ['#room1', '#room2'] },
            },
        ]);
    });

    it('revokeToken → DELETE /:id with optional ?reason= URI-encoded', async () => {
        const { apiClient, calls } = collectClient();
        await revokeToken('abc/123', undefined, { apiClient });
        await revokeToken('xyz', 'leaked', { apiClient });
        expect(calls).toEqual([
            {
                method: 'DELETE',
                path: '/v1/integrations/twitch-compat/bot-tokens/abc%2F123',
                body: undefined,
            },
            {
                method: 'DELETE',
                path: '/v1/integrations/twitch-compat/bot-tokens/xyz?reason=leaked',
                body: undefined,
            },
        ]);
    });
});

describe('twitchIrcBotTokensClient.isValidLabel', () => {
    it('treats empty as valid (label is optional)', () => {
        expect(isValidLabel('')).toBe(true);
        expect(isValidLabel('   ')).toBe(true);
    });
    it('accepts non-empty labels up to 80 chars', () => {
        expect(isValidLabel('Nightbot')).toBe(true);
        expect(isValidLabel('A'.repeat(80))).toBe(true);
    });
    it('rejects overlong labels', () => {
        expect(isValidLabel('A'.repeat(81))).toBe(false);
    });
});

describe('twitchIrcBotTokensClient.isValidScopeEntry', () => {
    it('accepts non-empty trimmed strings up to 255 chars', () => {
        expect(isValidScopeEntry('#room')).toBe(true);
        expect(isValidScopeEntry('A'.repeat(255))).toBe(true);
    });
    it('rejects empty / whitespace-only / overlong', () => {
        expect(isValidScopeEntry('')).toBe(false);
        expect(isValidScopeEntry('   ')).toBe(false);
        expect(isValidScopeEntry('A'.repeat(256))).toBe(false);
    });
});

describe('twitchIrcBotTokensClient.listSessions', () => {
    it('GET /v1/integrations/twitch-compat/bot-tokens/sessions', async () => {
        const { apiClient, calls } = collectClient();
        await listSessions({ apiClient });
        expect(calls).toEqual([
            {
                method: 'GET',
                path: '/v1/integrations/twitch-compat/bot-tokens/sessions',
                body: undefined,
            },
        ]);
    });
});
