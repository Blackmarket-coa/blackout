import { BlackoutSdkError } from '../errors/sdkError';
import type { RetryPolicy } from './types';
import { fetchWithRetry } from './withRetry';

export type MediaClient = {
    fetchBlob: (url: string, retry?: RetryPolicy) => Promise<Blob>;
    fetchArrayBuffer: (url: string, retry?: RetryPolicy) => Promise<ArrayBuffer>;
};

export type CreateMediaClientOptions = {
    fetchFn?: typeof fetch;
    defaultRetry?: RetryPolicy;
};

const requestMedia = async (
    url: string,
    parse: (response: Response) => Promise<Blob | ArrayBuffer>,
    fetchFn: typeof fetch,
    retry?: RetryPolicy,
): Promise<Blob | ArrayBuffer> => {
    const { response, retryable } = await fetchWithRetry(() => fetchFn(url), retry);

    if (response.ok) {
        return parse(response);
    }

    throw new BlackoutSdkError(
        'MEDIA_FETCH_FAILED',
        `Unable to fetch media (${response.status}).`,
        retryable ? 'retryable' : 'fatal',
    );
};

export const createMediaClient = ({ fetchFn = fetch, defaultRetry }: CreateMediaClientOptions = {}): MediaClient => ({
    fetchBlob: (url, retry) => requestMedia(url, (response) => response.blob(), fetchFn, retry ?? defaultRetry) as Promise<Blob>,
    fetchArrayBuffer: (url, retry) =>
        requestMedia(url, (response) => response.arrayBuffer(), fetchFn, retry ?? defaultRetry) as Promise<ArrayBuffer>,
});

export const fetchBlob = async (url: string, fetchFn: typeof fetch = fetch): Promise<Blob> => {
    const mediaClient = createMediaClient({ fetchFn });
    return mediaClient.fetchBlob(url);
};
