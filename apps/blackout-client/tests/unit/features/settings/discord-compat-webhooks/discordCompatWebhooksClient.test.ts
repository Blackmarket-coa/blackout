import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import {
    createWebhook,
    deleteWebhook,
    isValidAvatarUrl,
    isValidMatrixRoomId,
    isValidWebhookName,
    listWebhooks,
} from '../../../../../src/app/features/settings/discord-compat-webhooks/discordCompatWebhooksClient';

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

describe('discordCompatWebhooksClient: wire contracts', () => {
    it('listWebhooks → GET /v1/integrations/discord-compat/webhooks', async () => {
        const { apiClient, calls } = collectClient();
        await listWebhooks({ apiClient });
        expect(calls).toEqual([
            { method: 'GET', path: '/v1/integrations/discord-compat/webhooks', body: undefined },
        ]);
    });

    it('createWebhook → POST with the typed body', async () => {
        const { apiClient, calls } = collectClient();
        await createWebhook(
            { name: 'GitHub', matrixRoomId: '!den:bmc', avatarUrl: 'https://x/i.png' },
            { apiClient },
        );
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/discord-compat/webhooks',
                body: { name: 'GitHub', matrixRoomId: '!den:bmc', avatarUrl: 'https://x/i.png' },
            },
        ]);
    });

    it('deleteWebhook → DELETE /:id with the id URI-encoded', async () => {
        const { apiClient, calls } = collectClient();
        await deleteWebhook('abc/123', { apiClient });
        expect(calls).toEqual([
            {
                method: 'DELETE',
                path: '/v1/integrations/discord-compat/webhooks/abc%2F123',
                body: undefined,
            },
        ]);
    });
});

describe('discordCompatWebhooksClient.isValidWebhookName', () => {
    it('accepts non-empty trimmed names up to 80 chars', () => {
        expect(isValidWebhookName('GitHub')).toBe(true);
        expect(isValidWebhookName('A'.repeat(80))).toBe(true);
    });

    it('rejects empty / whitespace / overlong', () => {
        expect(isValidWebhookName('')).toBe(false);
        expect(isValidWebhookName('   ')).toBe(false);
        expect(isValidWebhookName('A'.repeat(81))).toBe(false);
    });
});

describe('discordCompatWebhooksClient.isValidMatrixRoomId', () => {
    it('accepts canonical room ids and aliases', () => {
        expect(isValidMatrixRoomId('!opaque:server.tld')).toBe(true);
        expect(isValidMatrixRoomId('#alias:server.tld')).toBe(true);
    });

    it('rejects malformed values', () => {
        expect(isValidMatrixRoomId('')).toBe(false);
        expect(isValidMatrixRoomId('opaque:server')).toBe(false);
        expect(isValidMatrixRoomId('!no-server')).toBe(false);
        expect(isValidMatrixRoomId('@user:server.tld')).toBe(false);
    });
});

describe('discordCompatWebhooksClient.isValidAvatarUrl', () => {
    it('treats empty as valid (optional field)', () => {
        expect(isValidAvatarUrl('')).toBe(true);
        expect(isValidAvatarUrl('   ')).toBe(true);
    });

    it('accepts http(s) urls under 2049 chars', () => {
        expect(isValidAvatarUrl('https://example.com/i.png')).toBe(true);
        expect(isValidAvatarUrl('http://x/i')).toBe(true);
    });

    it('rejects non-http(s) schemes and overlong values', () => {
        expect(isValidAvatarUrl('ftp://x/i')).toBe(false);
        expect(isValidAvatarUrl('javascript:alert(1)')).toBe(false);
        expect(isValidAvatarUrl(`https://x/${'a'.repeat(2050)}`)).toBe(false);
    });
});
