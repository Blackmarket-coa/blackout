import type { ApiClient, ApiRequest, RetryPolicy } from './types';
import { BlackoutSdkError } from '../errors/sdkError';
import { fetchWithRetry } from './withRetry';

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

export const createFetchApiClient = ({
    baseUrl,
    fetchFn = fetch,
    defaultHeaders,
    defaultRetry,
}: FetchApiClientOptions = {}): ApiClient => {
    const request = async <TResponse>({ method, path, body, retry }: ApiRequest): Promise<TResponse> => {
        const { response, retryable } = await fetchWithRetry(
            () =>
                fetchFn(resolveUrl(path, baseUrl), {
                    method,
                    headers: {
                        Accept: 'application/json',
                        ...(body ? { 'Content-Type': 'application/json' } : {}),
                        ...defaultHeaders,
                    },
                    body: body ? JSON.stringify(body) : undefined,
                }),
            retry ?? defaultRetry,
        );

        if (response.ok) {
            return (await response.json()) as TResponse;
        }

        throw new BlackoutSdkError(
            'HTTP_REQUEST_FAILED',
            `Request failed (${response.status}) for ${path}`,
            retryable ? 'retryable' : 'fatal',
        );
    };

    return request;
};
