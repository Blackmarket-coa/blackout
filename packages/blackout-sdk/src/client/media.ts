import { BlackoutSdkError } from '../errors/sdkError';
import type { RetryPolicy } from './types';
import { fetchWithRetry } from './withRetry';

/**
 * A ceiling on how much a media request may bring into memory. The limit is
 * enforced on the bytes that arrive, not on what the sender of a message said
 * the size was, so a message that understates its attachment cannot make a
 * client buffer more than the caller allowed.
 */
export type MediaFetchLimits = {
    /** Fail with `MEDIA_TOO_LARGE` once the body exceeds this many bytes. */
    maxBytes?: number;
};

export type MediaClient = {
    fetchBlob: (url: string, retry?: RetryPolicy) => Promise<Blob>;
    fetchArrayBuffer: (
        url: string,
        retry?: RetryPolicy,
        limits?: MediaFetchLimits
    ) => Promise<ArrayBuffer>;
};

export type CreateMediaClientOptions = {
    fetchFn?: typeof fetch;
    defaultRetry?: RetryPolicy;
};

/** The code on the error thrown when a body exceeds `MediaFetchLimits.maxBytes`. */
export const MEDIA_TOO_LARGE = 'MEDIA_TOO_LARGE';

const tooLarge = (maxBytes: number): BlackoutSdkError =>
    new BlackoutSdkError(
        MEDIA_TOO_LARGE,
        `Media is larger than the ${maxBytes} bytes allowed for this request.`,
        'fatal'
    );

const discard = async (response: Response): Promise<void> => {
    try {
        await response.body?.cancel();
    } catch {
        // Nothing to release; the limit error is what the caller needs.
    }
};

/**
 * Read a response body, stopping as soon as it is known to exceed `maxBytes`:
 * at once when `Content-Length` says so, otherwise at the first chunk that
 * crosses the line.
 */
const readBounded = async (response: Response, maxBytes: number): Promise<ArrayBuffer> => {
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) > maxBytes) {
        await discard(response);
        throw tooLarge(maxBytes);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        // No stream to count (older runtimes): the body is buffered whole, and
        // only then can it be measured.
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > maxBytes) throw tooLarge(maxBytes);
        return buffer;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            try {
                await reader.cancel();
            } catch {
                // As in `discard`.
            }
            throw tooLarge(maxBytes);
        }
        chunks.push(value);
    }

    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return joined.buffer;
};

const requestMedia = async (
    url: string,
    parse: (response: Response) => Promise<Blob | ArrayBuffer>,
    fetchFn: typeof fetch,
    retry?: RetryPolicy
): Promise<Blob | ArrayBuffer> => {
    const { response, retryable } = await fetchWithRetry(() => fetchFn(url), retry);

    if (response.ok) {
        return parse(response);
    }

    throw new BlackoutSdkError(
        'MEDIA_FETCH_FAILED',
        `Unable to fetch media (${response.status}).`,
        retryable ? 'retryable' : 'fatal'
    );
};

export const createMediaClient = ({
    fetchFn = fetch,
    defaultRetry,
}: CreateMediaClientOptions = {}): MediaClient => ({
    fetchBlob: (url, retry) =>
        requestMedia(
            url,
            (response) => response.blob(),
            fetchFn,
            retry ?? defaultRetry
        ) as Promise<Blob>,
    fetchArrayBuffer: (url, retry, limits) =>
        requestMedia(
            url,
            (response) =>
                typeof limits?.maxBytes === 'number'
                    ? readBounded(response, limits.maxBytes)
                    : response.arrayBuffer(),
            fetchFn,
            retry ?? defaultRetry
        ) as Promise<ArrayBuffer>,
});

export const fetchBlob = async (url: string, fetchFn: typeof fetch = fetch): Promise<Blob> => {
    const mediaClient = createMediaClient({ fetchFn });
    return mediaClient.fetchBlob(url);
};
