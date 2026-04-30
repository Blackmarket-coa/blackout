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
    | 'blackout.notifications.digest.acknowledged'
    | 'blackout.media.upload.completed'
    | 'blackout.call.launch.intent'
    | 'blackout.stego.channel.created'
    | 'blackout.stego.channel.rotated'
    | 'blackout.stego.channel.expired'
    | 'blackout.settings.changed'
    | 'blackout.settings.labs.gate.changed'
    | 'blackout.moderation.mjolnir.protection.changed'
    | 'blackout.moderation.mjolnir.banlist.changed'
    | 'blackout.federation.alert.status'
    | 'blackout.townhall.lifecycle'
    | 'blackout.revenue.ops.snapshot';

export type EventEnvelope<TName extends BlackoutEventName, TPayload> = {
    event: TName;
    roomId: string;
    senderId: string;
    occurredAt: string;
    payload: TPayload;
};
