import { describe, expect, it } from 'vitest';
import {
    isCallLaunchIntent,
    isMediaUploadCompleted,
    MEDIA_EVENT_NAMES,
    type CallLaunchIntentPayload,
    type MediaUploadCompletedEvent,
    type MediaUploadCompletedPayload,
} from '@blackout/protocol';
import {
    buildDialpadIntent,
    createCallActions,
    createMediaActions,
    type CallBootstrapDescriptor,
    type MediaUploadProgress,
} from '@blackout/sdk';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

const buildClient = <T>(response: T) => {
    const calls: ApiRequest[] = [];
    const apiClient: ApiClient = async (request) => {
        calls.push(request);
        return response as never;
    };
    return { apiClient, calls };
};

describe('@blackout/protocol media + call event guards (BKL-006)', () => {
    it('publishes the canonical Matrix event types', () => {
        expect(MEDIA_EVENT_NAMES.uploadCompleted).toBe('co.bmc.media.upload.completed');
        expect(MEDIA_EVENT_NAMES.callLaunchIntent).toBe('co.bmc.call.launch.intent');
    });

    it('isMediaUploadCompleted narrows valid envelopes', () => {
        const valid: MediaUploadCompletedEvent = {
            event: 'blackout.media.upload.completed',
            roomId: '!r:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: {
                uploadId: 'u-1',
                roomId: '!r:srv',
                filename: 'cat.png',
                contentType: 'image/png',
                sizeBytes: 1024,
                completedAt: '2026-04-27T00:00:01.000Z',
                status: 'completed',
                mxc: 'mxc://srv/abc',
            },
        };
        expect(isMediaUploadCompleted(valid)).toBe(true);
        expect(isCallLaunchIntent(valid)).toBe(false);
        expect(isMediaUploadCompleted({ ...valid, payload: { uploadId: 'x' } })).toBe(false);
    });

    it('isCallLaunchIntent narrows valid envelopes and enforces kind union', () => {
        const valid = {
            event: 'blackout.call.launch.intent',
            roomId: '!r:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: {
                intentId: 'i-1',
                kind: 'pstn-dialpad' as const,
                target: '+15551234567',
                issuedAt: '2026-04-27T00:00:00.000Z',
            },
        };
        expect(isCallLaunchIntent(valid)).toBe(true);
        expect(
            isCallLaunchIntent({
                ...valid,
                payload: { ...valid.payload, kind: 'not-a-kind' },
            })
        ).toBe(false);
    });
});

describe('@blackout/sdk createMediaActions', () => {
    it('fetchUploadProgress + cancelUpload + fetchCompletedUpload encode upload ids', async () => {
        const { apiClient, calls } = buildClient<MediaUploadProgress>({
            uploadId: 'u-1',
            status: 'in_progress',
            bytesUploaded: 256,
            sizeBytes: 1024,
        });
        const actions = createMediaActions(apiClient);

        await actions.fetchUploadProgress('u/1 with space');
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: `/v1/media/uploads/${encodeURIComponent('u/1 with space')}`,
        });

        await actions.cancelUpload('u-2');
        expect(calls.at(-1)).toEqual({ method: 'DELETE', path: '/v1/media/uploads/u-2' });

        await actions.fetchCompletedUpload('u-3');
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: '/v1/media/uploads/u-3/completed',
        });
    });
});

describe('@blackout/sdk createCallActions', () => {
    const bootstrap: CallBootstrapDescriptor = {
        intentId: 'i-1',
        kind: 'pstn-dialpad',
        transportUrl: 'https://gateway.example/dial',
    };

    it('launchCall posts the supplied intent payload', async () => {
        const payload: CallLaunchIntentPayload = {
            intentId: 'i-1',
            kind: 'element-call',
            target: '!r:srv',
            issuedAt: '2026-04-27T00:00:00.000Z',
        };
        const { apiClient, calls } = buildClient(bootstrap);
        const actions = createCallActions(apiClient);

        await actions.launchCall(payload);
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: '/v1/call/launch',
            body: payload,
        });
    });

    it('dialpadCall injects kind=pstn-dialpad', async () => {
        const { apiClient, calls } = buildClient(bootstrap);
        const actions = createCallActions(apiClient);

        await actions.dialpadCall({
            target: '+15551234567',
            intentId: 'i-2',
            issuedAt: '2026-04-27T00:00:00.000Z',
        });
        expect(calls.at(-1)?.body).toEqual({
            target: '+15551234567',
            intentId: 'i-2',
            issuedAt: '2026-04-27T00:00:00.000Z',
            kind: 'pstn-dialpad',
        });
    });

    it('getCallBootstrap encodes intent id', async () => {
        const { apiClient, calls } = buildClient(bootstrap);
        const actions = createCallActions(apiClient);
        await actions.getCallBootstrap('intent 9');
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: `/v1/call/intents/${encodeURIComponent('intent 9')}`,
        });
    });
});

describe('buildDialpadIntent', () => {
    it('strips formatting characters from the dialed number', () => {
        const intent = buildDialpadIntent(' +1 (555) 123-4567 ', {
            intentId: 'i-1',
            issuedAt: '2026-04-27T00:00:00.000Z',
        });
        expect(intent.target).toBe('+15551234567');
        expect(intent.kind).toBe('pstn-dialpad');
        expect(intent.intentId).toBe('i-1');
        expect(intent.issuedAt).toBe('2026-04-27T00:00:00.000Z');
    });

    it('synthesizes intentId + issuedAt when omitted', () => {
        const intent = buildDialpadIntent('+15551234567');
        expect(intent.intentId.startsWith('dialpad-')).toBe(true);
        expect(typeof intent.issuedAt).toBe('string');
        expect(Number.isFinite(new Date(intent.issuedAt).getTime())).toBe(true);
    });

    it('passes through metadata when provided', () => {
        const intent = buildDialpadIntent('+15551234567', {
            metadata: { panelId: 'call.dialpad.workspace' },
        });
        expect(intent.metadata).toEqual({ panelId: 'call.dialpad.workspace' });
    });

    it('omits metadata field when not provided', () => {
        const intent = buildDialpadIntent('+15551234567');
        expect(intent).not.toHaveProperty('metadata');
    });
});

describe('shape sanity: MediaUploadCompletedPayload statuses', () => {
    it('completed envelopes carry an mxc field', () => {
        const completed: MediaUploadCompletedPayload = {
            uploadId: 'u-1',
            roomId: '!r:srv',
            mxc: 'mxc://srv/abc',
            filename: 'a.png',
            contentType: 'image/png',
            sizeBytes: 10,
            completedAt: '2026-04-27T00:00:00.000Z',
            status: 'completed',
        };
        expect(completed.status).toBe('completed');
        expect(completed.mxc).toBeDefined();
    });
});
