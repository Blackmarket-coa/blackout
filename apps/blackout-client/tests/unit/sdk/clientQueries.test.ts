import { describe, expect, it, vi } from 'vitest';
import { createClientQueries, fetchBlob, type ApiClient } from '@blackout/sdk';

describe('clientQueries', () => {
    it('builds homeserver well-known matrix client endpoint', async () => {
        const apiClient: ApiClient = vi.fn(async () => ({
            'org.matrix.msc4143.rtc_foci': [
                { type: 'livekit', livekit_service_url: 'wss://calls.example.org' },
            ],
        }));

        const queries = createClientQueries(apiClient);
        await queries.getWellKnownMatrixClient('https://matrix.example.org');

        expect(apiClient).toHaveBeenCalledWith({
            method: 'GET',
            path: 'https://matrix.example.org/.well-known/matrix/client',
        });
    });

    it('fetches media blobs through sdk helper', async () => {
        const blob = new Blob(['ok'], { type: 'text/plain' });
        const fetchFn = vi.fn(async () => new Response(blob, { status: 200 }));

        const result = await fetchBlob('https://cdn.example.org/file.png', fetchFn);

        expect(result).toEqual(blob);
        expect(fetchFn).toHaveBeenCalledWith('https://cdn.example.org/file.png');
    });

});
