import { BlackoutSdkError } from '../errors/sdkError';
import type { RetryPolicy } from './types';

export type MediaClient = {
    fetchBlob: (url: string, retry?: RetryPolicy) => Promise<Blob>;
    fetchArrayBuffer: (url: string, retry?: RetryPolicy) => Promise<ArrayBuffer>;
};

export type CreateMediaClientOptions = {
    fetchFn?: typeof fetch;
    defaultRetry?: RetryPolicy;
};

const delay = async (ms: number): Promise<void> => {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
};

const shouldRetryStatus = (status: number, retryOnStatuses?: number[]) => {
    if (Array.isArray(retryOnStatuses) && retryOnStatuses.length > 0) {
        return retryOnStatuses.includes(status);
    }

    return status === 429 || status >= 500;
};

const requestMedia = async (
    url: string,
    parse: (response: Response) => Promise<Blob | ArrayBuffer>,
    fetchFn: typeof fetch,
    retry?: RetryPolicy,
): Promise<Blob | ArrayBuffer> => {
    const attempts = Math.max(1, retry?.attempts ?? 1);
    const backoffMs = retry?.backoffMs ?? 0;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const response = await fetchFn(url);
        if (response.ok) {
            return parse(response);
        }

        const retryable = shouldRetryStatus(response.status, retry?.retryOnStatuses);
        if (retryable && attempt < attempts) {
            await delay(backoffMs * attempt);
            continue;
        }

        throw new BlackoutSdkError(
            'MEDIA_FETCH_FAILED',
            `Unable to fetch media (${response.status}).`,
            retryable ? 'retryable' : 'fatal',
        );
    }

    throw new BlackoutSdkError('MEDIA_FETCH_FAILED', 'Unable to fetch media.');
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
