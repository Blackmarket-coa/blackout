import type { EventEnvelope } from '../common/types';

export type ModerationActionTaken = EventEnvelope<
    'blackout.moderation.action.taken',
    {
        actionId: string;
        actionType: 'warn' | 'mute' | 'ban' | 'redact';
        targetUserId: string;
        reason?: string;
    }
>;
