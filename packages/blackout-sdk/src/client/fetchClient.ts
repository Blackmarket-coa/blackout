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
            // A 2xx whose body isn't JSON almost always means the request
            // never reached the API — typically a SPA host serving
            // index.html as a fallback for an unproxied path, or an edge
            // returning an HTML error page with a 200. Surface that as a
            // structured SDK error instead of letting `response.json()`
            // throw a raw `SyntaxError: Unexpected token '<', "<!DOCTYPE"…`
            // that ends up rendered verbatim in the UI.
            try {
                return (await response.json()) as TResponse;
            } catch {
                const contentType = response.headers.get('content-type') ?? 'unknown';
                throw new BlackoutSdkError(
                    'HTTP_BAD_RESPONSE',
                    `Expected JSON from ${path} but got ${contentType} (${response.status}). The API may be unreachable from this origin.`,
                    'fatal',
                );
            }
        }

        throw new BlackoutSdkError(
            'HTTP_REQUEST_FAILED',
            `Request failed (${response.status}) for ${path}`,
            retryable ? 'retryable' : 'fatal',
        );
    };

    return request;
};
