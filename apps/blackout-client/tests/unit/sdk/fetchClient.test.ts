import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';

const respond = (body: BodyInit, init: ResponseInit): typeof fetch =>
    (async () => new Response(body, init)) as unknown as typeof fetch;

describe('createFetchApiClient: non-JSON 2xx handling', () => {
    it('throws HTTP_BAD_RESPONSE when a 200 response is HTML (no JSON content-type)', async () => {
        const client = createFetchApiClient({
            baseUrl: 'http://localhost:0',
            fetchFn: respond('<!DOCTYPE html><html><body>Not the API</body></html>', {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' },
            }),
        });

        await expect(
            client({ method: 'GET', path: '/v1/invitations' }),
        ).rejects.toMatchObject({
            name: 'BlackoutSdkError',
            code: 'HTTP_BAD_RESPONSE',
        });
    });

    it('throws HTTP_BAD_RESPONSE when content-type claims JSON but body is malformed', async () => {
        const client = createFetchApiClient({
            baseUrl: 'http://localhost:0',
            fetchFn: respond('<!DOCTYPE html>', {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
        });

        await expect(
            client({ method: 'GET', path: '/v1/invitations' }),
        ).rejects.toMatchObject({
            name: 'BlackoutSdkError',
            code: 'HTTP_BAD_RESPONSE',
        });
    });

    it('returns parsed JSON when content-type is application/json', async () => {
        const client = createFetchApiClient({
            baseUrl: 'http://localhost:0',
            fetchFn: respond(JSON.stringify({ invitations: [] }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
        });

        await expect(
            client<{ invitations: unknown[] }>({ method: 'GET', path: '/v1/invitations' }),
        ).resolves.toEqual({ invitations: [] });
    });
});
