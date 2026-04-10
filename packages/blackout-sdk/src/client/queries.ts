import type { ApiClient } from './types';

export type WellKnownMatrixClient = Record<string, unknown>;

export const createClientQueries = (client: ApiClient) => ({
    getWellKnownMatrixClient: (homeserverUrl: string) =>
        client<WellKnownMatrixClient>({
            method: 'GET',
            path: new URL('/.well-known/matrix/client', homeserverUrl).toString(),
        }),
    getDeepDiveFeed: <TItem>(path = '/deep-dive-feed.json') =>
        client<TItem[]>({
            method: 'GET',
            path,
        }),
});
