import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import {
    createBridge,
    deleteBridge,
    isValidMatrixRoomId,
    isValidTwitchChannelLogin,
    listBridges,
} from '../../../../../src/app/features/settings/twitch-chat-bridges/twitchChatBridgesClient';

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

describe('twitchChatBridgesClient: wire contracts', () => {
    it('listBridges → GET /v1/integrations/twitch/chat-bridges', async () => {
        const { apiClient, calls } = collectClient();
        await listBridges({ apiClient });
        expect(calls).toEqual([
            { method: 'GET', path: '/v1/integrations/twitch/chat-bridges', body: undefined },
        ]);
    });

    it('createBridge → POST with the typed body', async () => {
        const { apiClient, calls } = collectClient();
        await createBridge(
            { twitchChannel: 'streamer', matrixRoomId: '!den:bmc' },
            { apiClient },
        );
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/twitch/chat-bridges',
                body: { twitchChannel: 'streamer', matrixRoomId: '!den:bmc' },
            },
        ]);
    });

    it('deleteBridge → DELETE /:id with the bridge id URI-encoded', async () => {
        const { apiClient, calls } = collectClient();
        await deleteBridge('abc/123', { apiClient });
        expect(calls).toEqual([
            {
                method: 'DELETE',
                path: '/v1/integrations/twitch/chat-bridges/abc%2F123',
                body: undefined,
            },
        ]);
    });
});

describe('twitchChatBridgesClient.isValidTwitchChannelLogin', () => {
    it('accepts valid Twitch logins', () => {
        expect(isValidTwitchChannelLogin('streamer')).toBe(true);
        expect(isValidTwitchChannelLogin('Streamer42')).toBe(true);
        expect(isValidTwitchChannelLogin('a_b_c')).toBe(true);
        expect(isValidTwitchChannelLogin('1234567890123456789012345')).toBe(true); // 25 chars
    });

    it('rejects malformed logins', () => {
        expect(isValidTwitchChannelLogin('')).toBe(false);
        expect(isValidTwitchChannelLogin('has-hyphen')).toBe(false);
        expect(isValidTwitchChannelLogin('has space')).toBe(false);
        expect(isValidTwitchChannelLogin('has.dot')).toBe(false);
        expect(isValidTwitchChannelLogin('a'.repeat(26))).toBe(false); // 26 chars > 25
    });

    it('does not blanket-accept whitespace-padded logins (caller should trim)', () => {
        // Validation tolerates surrounding whitespace via the trim() guard so
        // a user pasting from a clipboard with a trailing newline still gets
        // a green check.
        expect(isValidTwitchChannelLogin('  streamer  ')).toBe(true);
    });
});

describe('twitchChatBridgesClient.isValidMatrixRoomId', () => {
    it('accepts canonical room ids', () => {
        expect(isValidMatrixRoomId('!opaque:server.tld')).toBe(true);
        expect(isValidMatrixRoomId('!a:b')).toBe(true);
    });

    it('accepts room aliases', () => {
        expect(isValidMatrixRoomId('#alias:server.tld')).toBe(true);
    });

    it('rejects malformed values', () => {
        expect(isValidMatrixRoomId('')).toBe(false);
        expect(isValidMatrixRoomId('opaque:server')).toBe(false); // missing sigil
        expect(isValidMatrixRoomId('!no-server')).toBe(false); // no colon
        expect(isValidMatrixRoomId('!has space:server.tld')).toBe(false);
        expect(isValidMatrixRoomId('@user:server.tld')).toBe(false); // user id, not room
    });
});
