import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import {
    createBridge,
    deleteBridge,
    isValidMatrixRoomId,
    isValidYoutubeChannelId,
    listBridges,
    syncBridge,
} from '../../../../../src/app/features/settings/youtube-chat-bridges/youtubeChatBridgesClient';

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

describe('youtubeChatBridgesClient: wire contracts', () => {
    it('listBridges → GET /v1/integrations/youtube/chat-bridges', async () => {
        const { apiClient, calls } = collectClient();
        await listBridges({ apiClient });
        expect(calls).toEqual([
            { method: 'GET', path: '/v1/integrations/youtube/chat-bridges', body: undefined },
        ]);
    });

    it('createBridge → POST with the typed body', async () => {
        const { apiClient, calls } = collectClient();
        await createBridge(
            { youtubeChannelId: 'UCabcdefghijklmnopqrstuv', matrixRoomId: '!den:bmc' },
            { apiClient },
        );
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/youtube/chat-bridges',
                body: { youtubeChannelId: 'UCabcdefghijklmnopqrstuv', matrixRoomId: '!den:bmc' },
            },
        ]);
    });

    it('deleteBridge → DELETE /:id with the bridge id URI-encoded', async () => {
        const { apiClient, calls } = collectClient();
        await deleteBridge('abc/123', { apiClient });
        expect(calls).toEqual([
            {
                method: 'DELETE',
                path: '/v1/integrations/youtube/chat-bridges/abc%2F123',
                body: undefined,
            },
        ]);
    });

    it('syncBridge → POST /:id/sync with the bridge id URI-encoded', async () => {
        const { apiClient, calls } = collectClient();
        await syncBridge('abc/456', { apiClient });
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/youtube/chat-bridges/abc%2F456/sync',
                body: undefined,
            },
        ]);
    });
});

describe('youtubeChatBridgesClient.isValidYoutubeChannelId', () => {
    it('accepts valid YouTube channel ids (UC + 22-42 chars)', () => {
        expect(isValidYoutubeChannelId('UCabcdefghijklmnopqrstuv')).toBe(true); // 24 chars total = 22 after UC
        expect(isValidYoutubeChannelId('UC-_abcdefghijklmnop_-AB')).toBe(true);
        expect(isValidYoutubeChannelId('  UCabcdefghijklmnopqrstuv  ')).toBe(true); // trims
    });

    it('rejects malformed channel ids', () => {
        expect(isValidYoutubeChannelId('')).toBe(false);
        expect(isValidYoutubeChannelId('UC')).toBe(false); // too short
        expect(isValidYoutubeChannelId('xxabcdefghijklmnopqrstuv')).toBe(false); // wrong prefix
        expect(isValidYoutubeChannelId('UCwithSpace inIt12345')).toBe(false);
        expect(isValidYoutubeChannelId('UC' + 'a'.repeat(50))).toBe(false); // too long
    });
});

describe('youtubeChatBridgesClient.isValidMatrixRoomId', () => {
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
