import type { EventEnvelope } from '../common/types';

export type DeadDropCreated = EventEnvelope<
    'blackout.deaddrop.created',
    {
        deadDropId: string;
        expiresAt: string;
        encryptedPayload: string;
    }
>;

export type DeadDropOpened = EventEnvelope<
    'blackout.deaddrop.opened',
    {
        deadDropId: string;
        openedBy: string;
    }
>;
