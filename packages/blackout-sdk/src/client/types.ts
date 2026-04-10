export type ApiRequest = {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    body?: unknown;
};

export type ApiClient = <TResponse>(request: ApiRequest) => Promise<TResponse>;
