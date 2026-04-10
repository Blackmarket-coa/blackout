import type { ForumPostCreated } from '@blackout/blackout-protocol';
import type { ApiClient } from '../client/types';

export const createForumActions = (client: ApiClient) => ({
    createPost: (payload: ForumPostCreated['payload']) =>
        client<ForumPostCreated>({
            method: 'POST',
            path: '/v1/forum/posts',
            body: payload,
        }),
});
