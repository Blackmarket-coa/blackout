/**
 * Media pipeline + call launch contracts (BKL-006).
 *
 * Mirrors the upload/transcode metadata and call-launch intent semantics
 * that apps/blackout-web ships in `src/services/`, lifted into a typed
 * protocol so canonical and legacy hosts agree on the wire shape.
 */

import type { EventEnvelope } from '../common/types';

export const MEDIA_PROTOCOL_VERSION = 1 as const;

export const MEDIA_EVENT_NAMES = {
    uploadCompleted: 'co.bmc.media.upload.completed',
    callLaunchIntent: 'co.bmc.call.launch.intent',
} as const;

export type MediaUploadStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface MediaUploadCompletedPayload {
    /** Stable id for the upload (server-issued, used to reconcile retries). */
    uploadId: string;
    /** Originating room/space the upload belongs to. */
    roomId: string;
    /** Resolved Matrix Content URI when status is `completed`. */
    mxc?: string;
    /** Original filename, retained for renderers and audit. */
    filename: string;
    /** MIME type as detected by the upload pipeline. */
    contentType: string;
    /** Final byte length on the server, after transcoding (when applicable). */
    sizeBytes: number;
    /** ISO-8601 timestamp the pipeline finalized this upload. */
    completedAt: string;
    /** Pipeline-final status; receivers should ignore the envelope when not `completed` or `failed`. */
    status: MediaUploadStatus;
    /** Optional human-readable reason for `failed`; informational only. */
    failureReason?: string;
}

export type CallLaunchKind = 'element-call' | 'pstn-dialpad' | 'matrix-rtc';

export interface CallLaunchIntentPayload {
    /** Stable id for the intent (so receivers can deduplicate dispatches). */
    intentId: string;
    /** Which transport the launcher should bring up. */
    kind: CallLaunchKind;
    /** Target room id (for matrix-rtc / element-call) or PSTN E.164 (for pstn-dialpad). */
    target: string;
    /** ISO-8601 timestamp the intent was issued. */
    issuedAt: string;
    /** Optional metadata receivers may use for telemetry (e.g. originating panel id). */
    metadata?: Record<string, string>;
}

export type MediaUploadCompletedEvent = EventEnvelope<
    'blackout.media.upload.completed',
    MediaUploadCompletedPayload
>;

export type CallLaunchIntentEvent = EventEnvelope<
    'blackout.call.launch.intent',
    CallLaunchIntentPayload
>;
