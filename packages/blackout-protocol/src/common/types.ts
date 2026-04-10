export type BlackoutEventName =
    | 'blackout.governance.proposal.created'
    | 'blackout.governance.vote.cast'
    | 'blackout.forum.post.created'
    | 'blackout.deaddrop.created'
    | 'blackout.deaddrop.opened'
    | 'blackout.moderation.action.taken';

export type EventEnvelope<TName extends BlackoutEventName, TPayload> = {
    event: TName;
    roomId: string;
    senderId: string;
    occurredAt: string;
    payload: TPayload;
};
