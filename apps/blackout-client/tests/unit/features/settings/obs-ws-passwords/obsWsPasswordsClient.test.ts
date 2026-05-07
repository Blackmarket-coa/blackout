import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import {
    isValidLabel,
    listPasswords,
    mintPassword,
    revokePassword,
} from '../../../../../src/app/features/settings/obs-ws-passwords/obsWsPasswordsClient';

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

describe('obsWsPasswordsClient: wire contracts', () => {
    it('listPasswords → GET /v1/integrations/obs-ws/passwords', async () => {
        const { apiClient, calls } = collectClient();
        await listPasswords({ apiClient });
        expect(calls).toEqual([
            { method: 'GET', path: '/v1/integrations/obs-ws/passwords', body: undefined },
        ]);
    });

    it('mintPassword → POST with the typed body', async () => {
        const { apiClient, calls } = collectClient();
        await mintPassword({ label: 'Stream Deck' }, { apiClient });
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/obs-ws/passwords',
                body: { label: 'Stream Deck' },
            },
        ]);
    });

    it('revokePassword → DELETE /:id with optional ?reason= URI-encoded', async () => {
        const { apiClient, calls } = collectClient();
        await revokePassword('abc/123', undefined, { apiClient });
        await revokePassword('xyz', 'lost device', { apiClient });
        expect(calls).toEqual([
            {
                method: 'DELETE',
                path: '/v1/integrations/obs-ws/passwords/abc%2F123',
                body: undefined,
            },
            {
                method: 'DELETE',
                path: '/v1/integrations/obs-ws/passwords/xyz?reason=lost%20device',
                body: undefined,
            },
        ]);
    });
});

describe('obsWsPasswordsClient.isValidLabel', () => {
    it('treats empty as valid (label is optional)', () => {
        expect(isValidLabel('')).toBe(true);
        expect(isValidLabel('   ')).toBe(true);
    });
    it('accepts non-empty labels up to 80 chars', () => {
        expect(isValidLabel('Stream Deck')).toBe(true);
        expect(isValidLabel('A'.repeat(80))).toBe(true);
    });
    it('rejects overlong labels', () => {
        expect(isValidLabel('A'.repeat(81))).toBe(false);
    });
});
