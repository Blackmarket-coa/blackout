import type { EventEnvelope } from '../common/types';

export type ForumPostCreated = EventEnvelope<
    'blackout.forum.post.created',
    {
        postId: string;
        title: string;
        body: string;
        tags: string[];
    }
>;
