import type {
    CallLaunchIntentEvent,
    MediaUploadCompletedEvent,
} from './contracts';

export {
    MEDIA_EVENT_NAMES,
    MEDIA_PROTOCOL_VERSION,
    type CallLaunchIntentEvent,
    type CallLaunchIntentPayload,
    type CallLaunchKind,
    type MediaUploadCompletedEvent,
    type MediaUploadCompletedPayload,
    type MediaUploadStatus,
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

export const isMediaUploadCompleted = (
    value: unknown
): value is MediaUploadCompletedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.media.upload.completed') return false;
    const payload = (value as MediaUploadCompletedEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.uploadId === 'string' &&
        typeof payload.roomId === 'string' &&
        typeof payload.filename === 'string' &&
        typeof payload.contentType === 'string' &&
        typeof payload.sizeBytes === 'number' &&
        typeof payload.completedAt === 'string' &&
        typeof payload.status === 'string'
    );
};

export const isCallLaunchIntent = (
    value: unknown
): value is CallLaunchIntentEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.call.launch.intent') return false;
    const payload = (value as CallLaunchIntentEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.intentId === 'string' &&
        typeof payload.target === 'string' &&
        typeof payload.issuedAt === 'string' &&
        ['element-call', 'pstn-dialpad', 'matrix-rtc'].includes(payload.kind)
    );
};
