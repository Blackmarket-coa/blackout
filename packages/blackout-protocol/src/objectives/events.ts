import type { EventEnvelope } from '../common/types';
import {
    isDenObjectiveContributionPayload,
    isDenObjectivePayload,
    type DenObjectiveContributionPayload,
    type DenObjectivePayload,
} from './contracts';

/** State event: the objective definition. State key = `objectiveId`. */
export const DEN_OBJECTIVE_EVENT_TYPE = 'co.bmc.den.objective';
/** Timeline event: a single logged increment toward an objective. */
export const DEN_OBJECTIVE_CONTRIBUTION_EVENT_TYPE = 'co.bmc.den.objective.contribution';
export const OBJECTIVE_SCHEMA_VERSION = 1;

export type DenObjectiveSetEvent = EventEnvelope<
    'blackout.den.objective.set',
    DenObjectivePayload
>;

export type DenObjectiveContributedEvent = EventEnvelope<
    'blackout.den.objective.contributed',
    DenObjectiveContributionPayload
>;

const isEventEnvelope = (
    value: unknown,
): value is { roomId: string; senderId: string; occurredAt: string; event: string; payload: unknown } => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<{
        roomId: string;
        senderId: string;
        occurredAt: string;
        event: string;
    }>;
    return (
        typeof candidate.roomId === 'string' &&
        typeof candidate.senderId === 'string' &&
        typeof candidate.occurredAt === 'string' &&
        typeof candidate.event === 'string'
    );
};

export const isDenObjectiveSetEvent = (value: unknown): value is DenObjectiveSetEvent => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.den.objective.set') return false;
    return isDenObjectivePayload((value as DenObjectiveSetEvent).payload);
};

export const isDenObjectiveContributedEvent = (
    value: unknown,
): value is DenObjectiveContributedEvent => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.den.objective.contributed') return false;
    return isDenObjectiveContributionPayload((value as DenObjectiveContributedEvent).payload);
};
