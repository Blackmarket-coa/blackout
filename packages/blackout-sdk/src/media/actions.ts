import type {
    CallLaunchIntentEvent,
    CallLaunchIntentPayload,
    CallLaunchKind,
    MediaUploadCompletedEvent,
    MediaUploadCompletedPayload,
    MediaUploadStatus,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export type MediaUploadProgress = {
    uploadId: string;
    status: MediaUploadStatus;
    /** Bytes uploaded so far. Server-clamped to [0, sizeBytes]. */
    bytesUploaded: number;
    sizeBytes: number;
    /** Optional ISO-8601 expected completion timestamp. */
    estimatedCompletionAt?: string;
};

export type CallBootstrapDescriptor = {
    intentId: string;
    kind: CallLaunchKind;
    /** Resolved transport URL (Element Call instance, RTC server, etc.). */
    transportUrl: string;
    /** Optional bearer/JWT token the launcher should attach. */
    accessToken?: string;
    /** Per-kind transport metadata (room id, ICE servers, …). Receivers may ignore unknown keys. */
    metadata?: Record<string, string>;
};

export const createMediaActions = (client: ApiClient) => ({
    /**
     * Fetch upload progress for an in-flight upload. Status `pending`/`in_progress`
     * means the canonical client should keep polling or subscribe to events.
     */
    fetchUploadProgress: (uploadId: string) =>
        client<MediaUploadProgress>({
            method: 'GET',
            path: `/v1/media/uploads/${encodeURIComponent(uploadId)}`,
        }),
    /**
     * Cancel an in-flight upload. The server emits a
     * `blackout.media.upload.completed` envelope with `status: 'failed'`.
     */
    cancelUpload: (uploadId: string) =>
        client<MediaUploadCompletedEvent>({
            method: 'DELETE',
            path: `/v1/media/uploads/${encodeURIComponent(uploadId)}`,
        }),
    /**
     * Fetch finalized upload metadata for a completed upload (used by the
     * media-pipeline panel for previewing recently completed items).
     */
    fetchCompletedUpload: (uploadId: string) =>
        client<MediaUploadCompletedPayload>({
            method: 'GET',
            path: `/v1/media/uploads/${encodeURIComponent(uploadId)}/completed`,
        }),
});

export const createCallActions = (client: ApiClient) => ({
    /**
     * Launch a call via the canonical bootstrap endpoint. `payload.target` is
     * a room id for matrix-rtc/element-call, or an E.164 number for the
     * PSTN-style dialpad. Returns the transport descriptor the launcher
     * should connect to; the server simultaneously emits a
     * `blackout.call.launch.intent` envelope.
     */
    launchCall: (payload: CallLaunchIntentPayload) =>
        client<CallBootstrapDescriptor>({
            method: 'POST',
            path: '/v1/call/launch',
            body: payload,
        }),
    /**
     * Convenience for the dialpad surface: builds a PSTN intent and POSTs it.
     * The caller supplies the canonical E.164 string; metadata is forwarded.
     */
    dialpadCall: (
        payload: { target: string; intentId: string; issuedAt: string; metadata?: Record<string, string> }
    ) =>
        client<CallBootstrapDescriptor>({
            method: 'POST',
            path: '/v1/call/launch',
            body: { ...payload, kind: 'pstn-dialpad' as const },
        }),
    /**
     * Fetch a transport descriptor for an already-issued intent (used to
     * resume a call after a tab reload).
     */
    getCallBootstrap: (intentId: string) =>
        client<CallBootstrapDescriptor>({
            method: 'GET',
            path: `/v1/call/intents/${encodeURIComponent(intentId)}`,
        }),
});

/**
 * Pure helper: builds a canonical CallLaunchIntentPayload for the dialpad
 * surface. The caller supplies the dialed E.164 string; the helper sanitizes
 * + injects a UUID-shaped intent id when not provided.
 */
export const buildDialpadIntent = (
    target: string,
    options: { intentId?: string; issuedAt?: string; metadata?: Record<string, string> } = {}
): CallLaunchIntentPayload => {
    const sanitized = target.replace(/[\s\-().]/g, '');
    return {
        intentId:
            options.intentId ??
            `dialpad-${Math.random().toString(36).slice(2, 12)}-${Date.now()}`,
        kind: 'pstn-dialpad',
        target: sanitized,
        issuedAt: options.issuedAt ?? new Date().toISOString(),
        ...(options.metadata ? { metadata: options.metadata } : {}),
    };
};

export type {
    CallLaunchIntentEvent,
    CallLaunchIntentPayload,
    CallLaunchKind,
    MediaUploadCompletedEvent,
    MediaUploadCompletedPayload,
    MediaUploadStatus,
};
