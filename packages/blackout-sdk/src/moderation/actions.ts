import type { ModerationActionTaken } from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export const createModerationActions = (client: ApiClient) => ({
    takeAction: (payload: ModerationActionTaken['payload']) =>
        client<ModerationActionTaken>({
            method: 'POST',
            path: '/v1/moderation/actions',
            body: payload,
        }),
});
