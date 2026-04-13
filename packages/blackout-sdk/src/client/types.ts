export type RetryPolicy = {
    attempts: number;
    backoffMs?: number;
    retryOnStatuses?: number[];
};

export type ApiRequest = {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    body?: unknown;
    retry?: RetryPolicy;
};

export type ApiClient = <TResponse>(request: ApiRequest) => Promise<TResponse>;
