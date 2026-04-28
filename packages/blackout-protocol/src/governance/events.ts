import type { EventEnvelope } from '../common/types';
import type {
    GovernanceMeetingPayload,
    GovernanceProposalPayload,
    GovernanceTreasurySnapshotPayload,
    GovernanceVotePayload,
} from './contracts';

export const GOVERNANCE_PROPOSAL_EVENT_TYPE = 'co.bmc.proposal';
export const GOVERNANCE_VOTE_EVENT_TYPE = 'co.bmc.vote';
export const GOVERNANCE_MEETING_EVENT_TYPE = 'co.bmc.governance.meeting';
export const GOVERNANCE_TREASURY_SNAPSHOT_EVENT_TYPE =
    'co.bmc.governance.treasury.snapshot';
export const GOVERNANCE_SCHEMA_VERSION = 1;

export type GovernanceProposalCreated = EventEnvelope<
    'blackout.governance.proposal.created',
    GovernanceProposalPayload
>;

export type GovernanceVoteCast = EventEnvelope<'blackout.governance.vote.cast', GovernanceVotePayload>;

export type GovernanceMeetingScheduled = EventEnvelope<
    'blackout.governance.meeting.scheduled',
    GovernanceMeetingPayload
>;

export type GovernanceTreasurySnapshotPublished = EventEnvelope<
    'blackout.governance.treasury.snapshot.published',
    GovernanceTreasurySnapshotPayload
>;

const isEventEnvelope = (value: unknown): value is { roomId: string; senderId: string; occurredAt: string; event: string; payload: unknown } => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<{ roomId: string; senderId: string; occurredAt: string; event: string }>;
    return (
        typeof candidate.roomId === 'string' &&
        typeof candidate.senderId === 'string' &&
        typeof candidate.occurredAt === 'string' &&
        typeof candidate.event === 'string'
    );
};

export const isGovernanceProposalCreated = (
    value: unknown
): value is GovernanceProposalCreated => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.governance.proposal.created') return false;
    const payload = (value as GovernanceProposalCreated).payload;
    return typeof payload?.title === 'string';
};

export const isGovernanceVoteCast = (
    value: unknown
): value is GovernanceVoteCast => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.governance.vote.cast') return false;
    const payload = (value as GovernanceVoteCast).payload;
    return typeof payload?.proposalEventId === 'string';
};

export const isGovernanceMeetingScheduled = (
    value: unknown
): value is GovernanceMeetingScheduled => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.governance.meeting.scheduled') return false;
    const payload = (value as GovernanceMeetingScheduled).payload;
    if (!payload) return false;
    return (
        typeof payload.meetingId === 'string' &&
        typeof payload.title === 'string' &&
        typeof payload.startsAt === 'string' &&
        typeof payload.endsAt === 'string' &&
        Array.isArray(payload.attendees)
    );
};

export const isGovernanceTreasurySnapshotPublished = (
    value: unknown
): value is GovernanceTreasurySnapshotPublished => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.governance.treasury.snapshot.published') return false;
    const payload = (value as GovernanceTreasurySnapshotPublished).payload;
    if (!payload) return false;
    return (
        typeof payload.snapshotId === 'string' &&
        typeof payload.generatedAt === 'string' &&
        Array.isArray(payload.lines)
    );
};
