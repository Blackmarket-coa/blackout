import type { ApiClient, ApiRequest, RetryPolicy } from './types';
import { BlackoutSdkError } from '../errors/sdkError';
import { fetchWithRetry } from './withRetry';

export type FetchApiClientOptions = {
    baseUrl?: string;
    fetchFn?: typeof fetch;
    defaultHeaders?: HeadersInit;
    defaultRetry?: RetryPolicy;
    credentials?: RequestCredentials;
    /**
     * Non-2xx statuses whose JSON body should be resolved to the caller
     * instead of throwing. Use for endpoints that report *expected* outcomes
     * with a typed body and a 4xx status (e.g. invitation preview/redeem
     * returning `{ok:false,reason}` with 410). Transport errors and other
     * statuses still throw.
     */
    resolveOnStatuses?: number[];
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
    credentials,
    resolveOnStatuses,
}: FetchApiClientOptions = {}): ApiClient => {
    const request = async <TResponse>({
        method,
        path,
        body,
        retry,
        signal,
    }: ApiRequest): Promise<TResponse> => {
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
                    signal,
                    ...(credentials ? { credentials } : {}),
                }),
            retry ?? defaultRetry,
        );

        if (response.ok || (resolveOnStatuses?.includes(response.status) ?? false)) {
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
            response.status,
        );
    };

    return request;
};
