import { describe, expect, it, vi } from 'vitest';
import { BlackoutSdkError, MEDIA_TOO_LARGE, createMediaClient } from '@blackout/sdk';

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);

/** A response whose body arrives in the given chunks, with no Content-Length. */
const streamed = (chunks: Uint8Array[], onCancel?: () => void): Response => {
    let index = 0;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (index < chunks.length) {
                controller.enqueue(chunks[index]);
                index += 1;
            } else {
                controller.close();
            }
        },
        cancel() {
            onCancel?.();
        },
    });
    return new Response(body, { status: 200 });
};

describe('media client byte limit', () => {
    it('returns the whole body when it is within the limit', async () => {
        const client = createMediaClient({
            fetchFn: (async () => streamed([bytes(40), bytes(60)])) as unknown as typeof fetch,
        });
        const buffer = await client.fetchArrayBuffer('https://hs.example/media', undefined, {
            maxBytes: 100,
        });
        expect(buffer.byteLength).toBe(100);
        expect(new Uint8Array(buffer).every((b) => b === 7)).toBe(true);
    });

    it('refuses on Content-Length alone, before reading any of the body', async () => {
        const cancelled = vi.fn();
        const response = streamed([bytes(10)], cancelled);
        const headers = new Headers({ 'content-length': '5000' });
        Object.defineProperty(response, 'headers', { value: headers });
        const getReader = vi.spyOn(response.body as ReadableStream<Uint8Array>, 'getReader');
        const client = createMediaClient({
            fetchFn: (async () => response) as unknown as typeof fetch,
        });

        const failure = await client
            .fetchArrayBuffer('https://hs.example/media', undefined, { maxBytes: 1000 })
            .catch((err: unknown) => err);

        expect(failure).toBeInstanceOf(BlackoutSdkError);
        expect((failure as BlackoutSdkError).code).toBe(MEDIA_TOO_LARGE);
        expect((failure as BlackoutSdkError).kind).toBe('fatal');
        expect(getReader).not.toHaveBeenCalled();
        expect(cancelled).toHaveBeenCalledTimes(1);
    });

    it('stops at the chunk that crosses the limit when no length was declared', async () => {
        const cancelled = vi.fn();
        const delivered: number[] = [];
        const chunks = [bytes(400), bytes(400), bytes(400), bytes(400)];
        let index = 0;
        const body = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    if (index < chunks.length) {
                        delivered.push(index);
                        controller.enqueue(chunks[index]);
                        index += 1;
                    } else {
                        controller.close();
                    }
                },
                cancel() {
                    cancelled();
                },
            },
            // No read-ahead: a chunk is produced only when it is asked for.
            { highWaterMark: 0 }
        );
        const client = createMediaClient({
            fetchFn: (async () => new Response(body, { status: 200 })) as unknown as typeof fetch,
        });

        const failure = await client
            .fetchArrayBuffer('https://hs.example/media', undefined, { maxBytes: 1000 })
            .catch((err: unknown) => err);

        expect((failure as BlackoutSdkError).code).toBe(MEDIA_TOO_LARGE);
        // 400 + 400 is within 1000; the third chunk crosses it; the fourth is never read.
        expect(delivered).toEqual([0, 1, 2]);
        expect(cancelled).toHaveBeenCalledTimes(1);
    });

    it('a body exactly at the limit is accepted', async () => {
        const client = createMediaClient({
            fetchFn: (async () => streamed([bytes(1000)])) as unknown as typeof fetch,
        });
        const buffer = await client.fetchArrayBuffer('https://hs.example/media', undefined, {
            maxBytes: 1000,
        });
        expect(buffer.byteLength).toBe(1000);
    });

    it('without a limit the body is read whole, as before', async () => {
        const client = createMediaClient({
            fetchFn: (async () => streamed([bytes(3000)])) as unknown as typeof fetch,
        });
        const buffer = await client.fetchArrayBuffer('https://hs.example/media');
        expect(buffer.byteLength).toBe(3000);
    });

    it('measures a body it cannot stream after buffering it', async () => {
        const unstreamable = {
            ok: true,
            status: 200,
            headers: new Headers(),
            body: null,
            arrayBuffer: async () => bytes(2000).buffer,
        } as unknown as Response;
        const client = createMediaClient({
            fetchFn: (async () => unstreamable) as unknown as typeof fetch,
        });
        const failure = await client
            .fetchArrayBuffer('https://hs.example/media', undefined, { maxBytes: 1000 })
            .catch((err: unknown) => err);
        expect((failure as BlackoutSdkError).code).toBe(MEDIA_TOO_LARGE);
    });

    it('a failed request still reports the fetch failure, not a size error', async () => {
        const client = createMediaClient({
            fetchFn: (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch,
        });
        const failure = await client
            .fetchArrayBuffer('https://hs.example/media', undefined, { maxBytes: 10 })
            .catch((err: unknown) => err);
        expect((failure as BlackoutSdkError).code).toBe('MEDIA_FETCH_FAILED');
    });
});
