import type { EducationModuleProgressEvent } from './contracts';

export {
    EDUCATION_EVENT_NAMES,
    EDUCATION_PROTOCOL_VERSION,
    type EducationEventName,
    type EducationLessonDescriptor,
    type EducationModuleDescriptor,
    type EducationModuleProgressEvent,
    type EducationProgressPayload,
} from './contracts';

const isEnvelope = (
    value: unknown
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

export const isEducationModuleProgress = (
    value: unknown
): value is EducationModuleProgressEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.education.module.progress') return false;
    const payload = (value as EducationModuleProgressEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.subject === 'string' &&
        typeof payload.moduleId === 'string' &&
        Array.isArray(payload.completedLessonIds) &&
        typeof payload.updatedAt === 'string'
    );
};
