import { createClientQueries, createFetchApiClient, createMediaClient } from '@blackout/sdk';

const apiClient = createFetchApiClient({
    defaultRetry: {
        attempts: 3,
        backoffMs: 100,
    },
});

export const clientQueries = createClientQueries(apiClient);

export const mediaClient = createMediaClient({
    defaultRetry: {
        attempts: 3,
        backoffMs: 120,
    },
});
