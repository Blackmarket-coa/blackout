import type {
    CallLaunchIntentPayload,
    MediaUploadCompletedEvent,
    MediaUploadCompletedPayload,
} from '@blackout/protocol';
import {
    buildDialpadIntent,
    createCallActions,
    createMediaActions,
    type CallBootstrapDescriptor,
    type MediaUploadProgress,
} from '@blackout/sdk';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const mediaActions = (token: string | null) =>
    createMediaActions(createAuthorizedApiClient(token));

const callActions = (token: string | null) =>
    createCallActions(createAuthorizedApiClient(token));

export type { CallBootstrapDescriptor, MediaUploadProgress };
export { buildDialpadIntent };

export function fetchUploadProgress(
    uploadId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<MediaUploadProgress> {
    return mediaActions(token).fetchUploadProgress(uploadId);
}

export function cancelUpload(
    uploadId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<MediaUploadCompletedEvent> {
    return mediaActions(token).cancelUpload(uploadId);
}

export function fetchCompletedUpload(
    uploadId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<MediaUploadCompletedPayload> {
    return mediaActions(token).fetchCompletedUpload(uploadId);
}

export function launchCall(
    payload: CallLaunchIntentPayload,
    token: string | null = readBlackoutApiToken(),
): Promise<CallBootstrapDescriptor> {
    return callActions(token).launchCall(payload);
}

export function dialpadCall(
    payload: { target: string; intentId: string; issuedAt: string; metadata?: Record<string, string> },
    token: string | null = readBlackoutApiToken(),
): Promise<CallBootstrapDescriptor> {
    return callActions(token).dialpadCall(payload);
}

export function getCallBootstrap(
    intentId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<CallBootstrapDescriptor> {
    return callActions(token).getCallBootstrap(intentId);
}
