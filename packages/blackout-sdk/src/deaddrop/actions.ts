import type { DeadDropCreated, DeadDropOpened } from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export const createDeadDropActions = (client: ApiClient) => ({
    createDeadDrop: (payload: DeadDropCreated['payload']) =>
        client<DeadDropCreated>({
            method: 'POST',
            path: '/v1/deaddrop',
            body: payload,
        }),
    openDeadDrop: (payload: DeadDropOpened['payload']) =>
        client<DeadDropOpened>({
            method: 'POST',
            path: '/v1/deaddrop/open',
            body: payload,
        }),
});
