// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const transcodeClipMock = vi.fn();
const uploadMediaMock = vi.fn();
const postFeedItemMock = vi.fn();
const pickVideoMock = vi.fn();
const saveLocalVideoMock = vi.fn();
const listLocalVideosMock = vi.fn();
const loadLocalVideoBlobMock = vi.fn();
const removeLocalVideoMock = vi.fn();
const markLocalVideoPostedMock = vi.fn();

vi.mock('../../../../src/app/features/streaming/composer/clipTranscode', () => ({
    transcodeClip: (...args: unknown[]) => transcodeClipMock(...args),
}));
vi.mock('../../../../src/app/features/media/utils/matrixMedia', () => ({
    uploadMedia: (...args: unknown[]) => uploadMediaMock(...args),
    mxcToUrl: (mxc: string, hs: string) =>
        `${hs}/_matrix/media/v3/download/${mxc.replace('mxc://', '')}`,
}));
vi.mock('../../../../src/app/features/coalition/coalitionClient', () => ({
    postCoalitionFeedItem: (...args: unknown[]) => postFeedItemMock(...args),
}));
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClientOrNull: () => ({
        getUserId: () => '@creator:test',
        getHomeserverUrl: () => 'https://hs.test',
    }),
}));
vi.mock('../../../../src/platform/nativeMediaBridge', () => ({
    nativePickVideo: (...args: unknown[]) => pickVideoMock(...args),
}));
vi.mock('../../../../src/platform/localVideoVault', () => ({
    localVideoVaultSupported: () => true,
    saveLocalVideo: (...args: unknown[]) => saveLocalVideoMock(...args),
    listLocalVideos: (...args: unknown[]) => listLocalVideosMock(...args),
    loadLocalVideoBlob: (...args: unknown[]) => loadLocalVideoBlobMock(...args),
    removeLocalVideo: (...args: unknown[]) => removeLocalVideoMock(...args),
    markLocalVideoPosted: (...args: unknown[]) => markLocalVideoPostedMock(...args),
}));

import VideoComposer from '../../../../src/app/features/coalition/composer/VideoComposer';

const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
};

const setValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!
        .set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const click = async (el: Element) => {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
    });
};

describe('VideoComposer', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        for (const mock of [
            transcodeClipMock,
            uploadMediaMock,
            postFeedItemMock,
            pickVideoMock,
            saveLocalVideoMock,
            listLocalVideosMock,
            loadLocalVideoBlobMock,
            removeLocalVideoMock,
            markLocalVideoPostedMock,
        ]) {
            mock.mockReset();
        }
        listLocalVideosMock.mockResolvedValue([]);
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: vi.fn(() => 'blob:preview'),
            revokeObjectURL: vi.fn(),
        });
    });

    const mount = async () => {
        const onPosted = vi.fn();
        const onClose = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(
                <VideoComposer
                    scope={{ canopyId: 'canopy-1' }}
                    onPosted={onPosted}
                    onClose={onClose}
                />
            );
            await flush();
        });
        return { container, onPosted, onClose };
    };

    const query = (container: HTMLElement, testid: string): HTMLElement => {
        const el = container.querySelector(`[data-testid="${testid}"]`);
        if (!el) throw new Error(`missing testid ${testid}`);
        return el as HTMLElement;
    };

    it('requests the native camera when Record is pressed', async () => {
        pickVideoMock.mockResolvedValue(null);
        const { container } = await mount();
        await click(query(container, 'video-composer-record'));
        expect(pickVideoMock).toHaveBeenCalledWith({ source: 'camera' });
    });

    it('saves the original, uploads the rendition, and posts the feed item', async () => {
        pickVideoMock.mockResolvedValue({
            source: 'file-input',
            contentType: 'video/mp4',
            blob: new Blob(['raw'], { type: 'video/mp4' }),
            filename: 'take.mp4',
        });
        saveLocalVideoMock.mockResolvedValue({ id: 'vault-1' });
        transcodeClipMock.mockResolvedValue(new Blob(['small'], { type: 'video/mp4' }));
        uploadMediaMock.mockResolvedValue('mxc://hs.test/abc123');
        markLocalVideoPostedMock.mockResolvedValue(undefined);
        postFeedItemMock.mockResolvedValue({
            feedItem: { id: 'feed-1', kind: 'video', title: 'My take' },
        });

        const { container, onPosted } = await mount();
        await click(query(container, 'video-composer-record'));

        setValue(query(container, 'video-composer-title') as HTMLInputElement, 'My take');
        setValue(query(container, 'video-composer-end') as HTMLInputElement, '30');
        await click(query(container, 'video-composer-submit'));

        // Original saved to the device vault before anything uploads.
        expect(saveLocalVideoMock).toHaveBeenCalledTimes(1);
        const [savedBlob, savedMeta] = saveLocalVideoMock.mock.calls[0] as [
            File,
            { title: string }
        ];
        expect(savedBlob.name).toBe('take.mp4');
        expect(savedMeta.title).toBe('My take');

        // The rendition (not the original) is what uploads.
        expect(transcodeClipMock).toHaveBeenCalledTimes(1);
        const [, options] = transcodeClipMock.mock.calls[0] as [
            File,
            { compress?: boolean; vertical: boolean }
        ];
        expect(options.compress).toBe(true);
        expect(options.vertical).toBe(true);
        expect(uploadMediaMock).toHaveBeenCalledTimes(1);

        // Feed post carries the resolved homeserver media URL and the scope.
        expect(postFeedItemMock).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'video',
                title: 'My take',
                canopyId: 'canopy-1',
                mediaUrl: 'https://hs.test/_matrix/media/v3/download/hs.test/abc123',
            })
        );
        expect(markLocalVideoPostedMock).toHaveBeenCalledWith('vault-1');
        expect(onPosted).toHaveBeenCalledWith(expect.objectContaining({ id: 'feed-1' }));
    });

    it('falls back to the untouched recording when the ffmpeg core is missing', async () => {
        pickVideoMock.mockResolvedValue({
            source: 'file-input',
            contentType: 'video/mp4',
            blob: new Blob(['raw'], { type: 'video/mp4' }),
            filename: 'take.mp4',
        });
        saveLocalVideoMock.mockResolvedValue({ id: 'vault-1' });
        transcodeClipMock.mockRejectedValue(
            new Error('Clip editing engine is not installed on this deployment (missing).')
        );
        uploadMediaMock.mockResolvedValue('mxc://hs.test/raw1');
        markLocalVideoPostedMock.mockResolvedValue(undefined);
        postFeedItemMock.mockResolvedValue({ feedItem: { id: 'feed-2' } });

        const { container, onPosted } = await mount();
        await click(query(container, 'video-composer-record'));
        setValue(query(container, 'video-composer-title') as HTMLInputElement, 'Raw take');
        setValue(query(container, 'video-composer-end') as HTMLInputElement, '10');
        await click(query(container, 'video-composer-submit'));

        expect(uploadMediaMock).toHaveBeenCalledTimes(1);
        const uploaded = uploadMediaMock.mock.calls[0][1] as File;
        expect(uploaded.name).toBe('take.mp4');
        expect(onPosted).toHaveBeenCalled();
    });

    it('surfaces validation errors instead of posting', async () => {
        const { container } = await mount();
        await click(query(container, 'video-composer-submit'));
        expect(query(container, 'video-composer-error').textContent).toContain(
            'Record or choose a video first.'
        );
        expect(postFeedItemMock).not.toHaveBeenCalled();
    });

    it('lists vault originals and loads one for reposting', async () => {
        listLocalVideosMock.mockResolvedValue([
            {
                id: 'vault-9',
                title: 'Expired post',
                filename: 'old.mp4',
                contentType: 'video/mp4',
                sizeBytes: 4 * 1024 * 1024,
                durationSeconds: 21,
                savedAt: '2026-07-01T00:00:00.000Z',
                lastPostedAt: '2026-07-02T00:00:00.000Z',
            },
        ]);
        loadLocalVideoBlobMock.mockResolvedValue(new Blob(['old'], { type: 'video/mp4' }));

        const { container } = await mount();
        expect(query(container, 'video-composer-library').textContent).toContain('Expired post');

        await click(query(container, 'video-composer-library-load-vault-9'));
        expect(loadLocalVideoBlobMock).toHaveBeenCalledWith('vault-9');
        // The vault entry's saved title is adopted for the repost.
        const title = query(container, 'video-composer-title') as HTMLInputElement;
        expect(title.value).toBe('Expired post');
    });
});
