import type { ApiClient, ApiRequest, RetryPolicy } from './types';
import { BlackoutSdkError } from '../errors/sdkError';

export type FetchApiClientOptions = {
    baseUrl?: string;
    fetchFn?: typeof fetch;
    defaultHeaders?: HeadersInit;
    defaultRetry?: RetryPolicy;
};

const resolveUrl = (path: string, baseUrl?: string): string => {
    if (/^https?:\/\//.test(path)) return path;
    if (!baseUrl) return path;
    return new URL(path, baseUrl).toString();
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

export const createFetchApiClient = ({
    baseUrl,
    fetchFn = fetch,
    defaultHeaders,
    defaultRetry,
}: FetchApiClientOptions = {}): ApiClient => {
    const request = async <TResponse>({ method, path, body, retry }: ApiRequest): Promise<TResponse> => {
        const resolvedRetry = retry ?? defaultRetry;
        const attempts = Math.max(1, resolvedRetry?.attempts ?? 1);
        const backoffMs = resolvedRetry?.backoffMs ?? 0;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            const response = await fetchFn(resolveUrl(path, baseUrl), {
                method,
                headers: {
                    Accept: 'application/json',
                    ...(body ? { 'Content-Type': 'application/json' } : {}),
                    ...defaultHeaders,
                },
                body: body ? JSON.stringify(body) : undefined,
            });

            if (response.ok) {
                return (await response.json()) as TResponse;
            }

            const retryable = shouldRetryStatus(response.status, resolvedRetry?.retryOnStatuses);
            if (retryable && attempt < attempts) {
                await delay(backoffMs * attempt);
                continue;
            }

            throw new BlackoutSdkError(
                'HTTP_REQUEST_FAILED',
                `Request failed (${response.status}) for ${path}`,
                retryable ? 'retryable' : 'fatal',
            );
        }

        throw new BlackoutSdkError('HTTP_REQUEST_FAILED', `Request failed for ${path}`);
    };

    return request;
};
