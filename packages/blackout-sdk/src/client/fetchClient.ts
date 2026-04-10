import type { ApiClient, ApiRequest } from './types';
import { BlackoutSdkError } from '../errors/sdkError';

export type FetchApiClientOptions = {
    baseUrl?: string;
    fetchFn?: typeof fetch;
    defaultHeaders?: HeadersInit;
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
}: FetchApiClientOptions = {}): ApiClient => {
    const request = async <TResponse>({ method, path, body }: ApiRequest): Promise<TResponse> => {
        const response = await fetchFn(resolveUrl(path, baseUrl), {
            method,
            headers: {
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...defaultHeaders,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            throw new BlackoutSdkError(
                'HTTP_REQUEST_FAILED',
                `Request failed (${response.status}) for ${path}`,
            );
        }

        return (await response.json()) as TResponse;
    };

    return request;
};
