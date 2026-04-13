import { describe, expect, it, vi } from 'vitest';
import { BlackoutSdkError, createFetchApiClient, createMediaClient } from '@blackout/sdk';

describe('sdk network adapters', () => {
    it('retries JSON API calls with request-level retry policy', async () => {
        const fetchFn = vi
            .fn()
            .mockResolvedValueOnce(new Response('{}', { status: 503 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

        const client = createFetchApiClient({ fetchFn });
        const result = await client<{ ok: boolean }>({
            method: 'GET',
            path: 'https://api.example.org/v1/status',
            retry: { attempts: 2 },
        });

        expect(result).toEqual({ ok: true });
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('marks non-retryable API failures as fatal', async () => {
        const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
        const client = createFetchApiClient({ fetchFn });

        await expect(
            client({
                method: 'GET',
                path: 'https://api.example.org/v1/missing',
                retry: { attempts: 3 },
            })
        ).rejects.toMatchObject<Partial<BlackoutSdkError>>({
            code: 'HTTP_REQUEST_FAILED',
            kind: 'fatal',
        });

        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('retries media fetches and returns array buffers via typed adapter', async () => {
        const payload = new Uint8Array([1, 2, 3, 4]).buffer;
        const fetchFn = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 502 }))
            .mockResolvedValueOnce(new Response(payload, { status: 200 }));

        const media = createMediaClient({ fetchFn, defaultRetry: { attempts: 2 } });
        const result = await media.fetchArrayBuffer('https://cdn.example.org/aes.bin');

        expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3, 4]));
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });
});
