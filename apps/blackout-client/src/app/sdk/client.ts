import { createClientQueries, createFetchApiClient } from '@blackout/sdk';

const apiClient = createFetchApiClient();

export const clientQueries = createClientQueries(apiClient);
