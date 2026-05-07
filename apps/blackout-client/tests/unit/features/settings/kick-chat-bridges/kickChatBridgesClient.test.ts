import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import {
    createBridge,
    deleteBridge,
    isValidKickChatroomId,
    isValidMatrixRoomId,
    listBridges,
} from '../../../../../src/app/features/settings/kick-chat-bridges/kickChatBridgesClient';

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

describe('kickChatBridgesClient: wire contracts', () => {
    it('listBridges → GET /v1/integrations/kick/chat-bridges', async () => {
        const { apiClient, calls } = collectClient();
        await listBridges({ apiClient });
        expect(calls).toEqual([
            { method: 'GET', path: '/v1/integrations/kick/chat-bridges', body: undefined },
        ]);
    });

    it('createBridge → POST with the typed body', async () => {
        const { apiClient, calls } = collectClient();
        await createBridge(
            { kickChatroomId: '12345', matrixRoomId: '!den:bmc' },
            { apiClient },
        );
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/kick/chat-bridges',
                body: { kickChatroomId: '12345', matrixRoomId: '!den:bmc' },
            },
        ]);
    });

    it('deleteBridge → DELETE /:id with the bridge id URI-encoded', async () => {
        const { apiClient, calls } = collectClient();
        await deleteBridge('abc/123', { apiClient });
        expect(calls).toEqual([
            {
                method: 'DELETE',
                path: '/v1/integrations/kick/chat-bridges/abc%2F123',
                body: undefined,
            },
        ]);
    });
});

describe('kickChatBridgesClient.isValidKickChatroomId', () => {
    it('accepts positive integers up to 18 digits', () => {
        expect(isValidKickChatroomId('1')).toBe(true);
        expect(isValidKickChatroomId('12345')).toBe(true);
        expect(isValidKickChatroomId('999999999999999999')).toBe(true); // 18 digits
        expect(isValidKickChatroomId('  42  ')).toBe(true); // trims
    });

    it('rejects malformed chatroom ids', () => {
        expect(isValidKickChatroomId('')).toBe(false);
        expect(isValidKickChatroomId('0')).toBe(false); // not positive
        expect(isValidKickChatroomId('012')).toBe(false); // leading zero
        expect(isValidKickChatroomId('abc')).toBe(false);
        expect(isValidKickChatroomId('1234567890123456789')).toBe(false); // 19 digits
        expect(isValidKickChatroomId('12 34')).toBe(false);
    });
});

describe('kickChatBridgesClient.isValidMatrixRoomId', () => {
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
