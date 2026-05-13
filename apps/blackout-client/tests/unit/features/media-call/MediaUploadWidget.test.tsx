// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaUploadWidget } from '../../../../src/app/features/media-call/MediaUploadWidget';
import type {
    MediaUploadCompletedEvent,
    MediaUploadCompletedPayload,
} from '@blackout/protocol';
import type { MediaUploadProgress } from '../../../../src/app/features/media-call/mediaCallClient';

type MediaFetcher = {
    fetchUploadProgress: ReturnType<typeof vi.fn>;
    cancelUpload: ReturnType<typeof vi.fn>;
    fetchCompletedUpload: ReturnType<typeof vi.fn>;
};

const inProgress = (
    overrides: Partial<MediaUploadProgress> = {},
): MediaUploadProgress => ({
    uploadId: 'upload-123',
    status: 'in_progress',
    bytesUploaded: 256_000,
    sizeBytes: 1_024_000,
    ...overrides,
});

const completedPayload = (
    overrides: Partial<MediaUploadCompletedPayload> = {},
): MediaUploadCompletedPayload => ({
    uploadId: 'upload-123',
    roomId: '!room:example.org',
    mxc: 'mxc://example.org/abcDEF',
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 1_024_000,
    completedAt: '2026-05-13T13:00:00.000Z',
    status: 'completed',
    ...overrides,
});

const cancelEvent = (uploadId: string): MediaUploadCompletedEvent => ({
    event: 'blackout.media.upload.completed',
    roomId: '!room:example.org',
    senderId: '@server:example.org',
    occurredAt: '2026-05-13T13:05:00.000Z',
    payload: {
        ...completedPayload({ uploadId }),
        status: 'failed',
        failureReason: 'cancelled by user',
    },
});

const createFetcher = (overrides: Partial<MediaFetcher> = {}): MediaFetcher => ({
    fetchUploadProgress: vi.fn(async () => inProgress()),
    cancelUpload: vi.fn(async (id: string) => cancelEvent(id)),
    fetchCompletedUpload: vi.fn(async () => completedPayload()),
    ...overrides,
});

const mountWidget = async (fetcher: MediaFetcher) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <MediaUploadWidget
                fetchUploadProgress={
                    fetcher.fetchUploadProgress as unknown as React.ComponentProps<
                        typeof MediaUploadWidget
                    >['fetchUploadProgress']
                }
                cancelUpload={
                    fetcher.cancelUpload as unknown as React.ComponentProps<
                        typeof MediaUploadWidget
                    >['cancelUpload']
                }
                fetchCompletedUpload={
                    fetcher.fetchCompletedUpload as unknown as React.ComponentProps<
                        typeof MediaUploadWidget
                    >['fetchCompletedUpload']
                }
            />,
        );
        await Promise.resolve();
    });

    return { container, root };
};

const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const trackUpload = async (container: HTMLElement, uploadId: string) => {
    const idInput = container.querySelector(
        '[data-testid="media-upload-id-input"]',
    ) as HTMLInputElement;
    const form = container.querySelector(
        '[data-testid="media-upload-track-form"]',
    ) as HTMLFormElement;

    await act(async () => {
        setInputValue(idInput, uploadId);
        await Promise.resolve();
    });
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
        await Promise.resolve();
    });
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('MediaUploadWidget (BKL-006 Port 4 — upload pipeline)', () => {
    it('shows the no-tracking hint until an upload id is submitted', async () => {
        const fetcher = createFetcher();
        const { container } = await mountWidget(fetcher);

        expect(
            container.querySelector('[data-testid="media-upload-widget"]'),
        ).not.toBeNull();
        expect(
            container.querySelector('[data-testid="media-upload-no-tracking"]'),
        ).not.toBeNull();
        expect(fetcher.fetchUploadProgress).not.toHaveBeenCalled();
    });

    it('renders in-progress state with status, byte counts, and progress bar', async () => {
        const fetcher = createFetcher();
        const { container } = await mountWidget(fetcher);
        await trackUpload(container, 'upload-123');

        expect(fetcher.fetchUploadProgress).toHaveBeenCalledWith('upload-123');

        const statusLabel = container.querySelector('[data-testid="media-upload-status-label"]');
        expect(statusLabel?.textContent).toContain('in_progress');

        const bar = container.querySelector('[data-testid="media-upload-progress-bar"]');
        expect(bar?.getAttribute('aria-valuenow')).toBe('25');
        // Cancel is available while in-flight.
        expect(container.querySelector('[data-testid="media-upload-cancel"]')).not.toBeNull();
        // No completed card yet.
        expect(
            container.querySelector('[data-testid="media-upload-completed-card"]'),
        ).toBeNull();
    });

    it('renders the completed state with mxc + filename when status is completed', async () => {
        const fetcher = createFetcher({
            fetchUploadProgress: vi.fn(async () =>
                inProgress({ status: 'completed', bytesUploaded: 1_024_000 }),
            ),
        });
        const { container } = await mountWidget(fetcher);
        await trackUpload(container, 'upload-123');

        expect(fetcher.fetchCompletedUpload).toHaveBeenCalledWith('upload-123');
        const completedCard = container.querySelector(
            '[data-testid="media-upload-completed-card"]',
        );
        expect(completedCard).not.toBeNull();
        expect(completedCard?.textContent).toContain('photo.jpg');
        const mxc = container.querySelector('[data-testid="media-upload-completed-mxc"]');
        expect(mxc?.textContent).toBe('mxc://example.org/abcDEF');
        // Cancel button hidden once terminal.
        expect(container.querySelector('[data-testid="media-upload-cancel"]')).toBeNull();
    });

    it('hides the cancel button when status is failed (terminal state)', async () => {
        const fetcher = createFetcher({
            fetchUploadProgress: vi.fn(async () => inProgress({ status: 'failed' })),
        });
        const { container } = await mountWidget(fetcher);
        await trackUpload(container, 'upload-123');

        const statusLabel = container.querySelector('[data-testid="media-upload-status-label"]');
        expect(statusLabel?.textContent).toContain('failed');
        expect(container.querySelector('[data-testid="media-upload-cancel"]')).toBeNull();
    });

    it('calls cancelUpload then refreshes when the cancel button is clicked', async () => {
        const fetcher = createFetcher({
            fetchUploadProgress: vi
                .fn()
                // first load: in-flight
                .mockResolvedValueOnce(inProgress())
                // post-cancel refresh: terminal failed
                .mockResolvedValueOnce(inProgress({ status: 'failed' })),
        });
        const { container } = await mountWidget(fetcher);
        await trackUpload(container, 'upload-123');

        const cancelBtn = container.querySelector(
            '[data-testid="media-upload-cancel"]',
        ) as HTMLButtonElement;
        expect(cancelBtn).not.toBeNull();

        await act(async () => {
            cancelBtn.click();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.cancelUpload).toHaveBeenCalledWith('upload-123');
        // Two fetchUploadProgress calls: initial + post-cancel refresh.
        expect(fetcher.fetchUploadProgress).toHaveBeenCalledTimes(2);
        // Status flipped to failed; cancel hidden.
        expect(container.querySelector('[data-testid="media-upload-cancel"]')).toBeNull();
        const statusLabel = container.querySelector('[data-testid="media-upload-status-label"]');
        expect(statusLabel?.textContent).toContain('failed');
    });

    it('surfaces a load error via role="alert" when fetchUploadProgress throws', async () => {
        const fetcher = createFetcher({
            fetchUploadProgress: vi.fn(async () => {
                throw new Error('upload not found');
            }),
        });
        const { container } = await mountWidget(fetcher);
        await trackUpload(container, 'upload-missing');

        const error = container.querySelector('[data-testid="media-upload-load-error"]');
        expect(error?.textContent).toContain('upload not found');
        expect(error?.getAttribute('role')).toBe('alert');
        // No progress bar rendered.
        expect(
            container.querySelector('[data-testid="media-upload-progress-bar"]'),
        ).toBeNull();
    });

    it('surfaces a cancel error via role="alert" when cancelUpload throws', async () => {
        const fetcher = createFetcher({
            cancelUpload: vi.fn(async () => {
                throw new Error('cancel rejected');
            }),
        });
        const { container } = await mountWidget(fetcher);
        await trackUpload(container, 'upload-123');

        const cancelBtn = container.querySelector(
            '[data-testid="media-upload-cancel"]',
        ) as HTMLButtonElement;

        await act(async () => {
            cancelBtn.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        const error = container.querySelector('[data-testid="media-upload-cancel-error"]');
        expect(error?.textContent).toContain('cancel rejected');
        // Cancel button is re-enabled (cancelPending cleared).
        const stillThere = container.querySelector(
            '[data-testid="media-upload-cancel"]',
        ) as HTMLButtonElement;
        expect(stillThere.disabled).toBe(false);
    });
});
