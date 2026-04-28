export type BlackoutEventName =
    | 'blackout.governance.proposal.created'
    | 'blackout.governance.vote.cast'
    | 'blackout.governance.meeting.scheduled'
    | 'blackout.governance.treasury.snapshot.published'
    | 'blackout.forum.post.created'
    | 'blackout.deaddrop.created'
    | 'blackout.deaddrop.opened'
    | 'blackout.moderation.action.taken'
    | 'blackout.notifications.digest.generated'
    | 'blackout.notifications.digest.acknowledged';

export type EventEnvelope<TName extends BlackoutEventName, TPayload> = {
    event: TName;
    roomId: string;
    senderId: string;
    occurredAt: string;
    payload: TPayload;
};
