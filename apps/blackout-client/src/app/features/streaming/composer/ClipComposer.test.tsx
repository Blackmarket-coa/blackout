// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const transcodeClipMock = vi.fn();
const uploadMediaMock = vi.fn();
const createClipMock = vi.fn();

vi.mock('./clipTranscode', () => ({
    transcodeClip: (...args: unknown[]) => transcodeClipMock(...args),
}));
vi.mock('../../media/utils/matrixMedia', () => ({
    uploadMedia: (...args: unknown[]) => uploadMediaMock(...args),
}));
vi.mock('../../streams/streamsClient', () => ({
    createClip: (...args: unknown[]) => createClipMock(...args),
}));
vi.mock('../../../hooks/useMatrixClient', () => ({
    useMatrixClientOrNull: () => ({ getUserId: () => '@creator:test' }),
}));

import ClipComposer from './ClipComposer';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const setValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!
        .set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('ClipComposer', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        transcodeClipMock.mockReset();
        uploadMediaMock.mockReset();
        createClipMock.mockReset();
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: vi.fn(() => 'blob:preview'),
            revokeObjectURL: vi.fn(),
        });
    });

    const mount = async () => {
        const onCreated = vi.fn();
        const onClose = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(<ClipComposer onCreated={onCreated} onClose={onClose} />);
            await flush();
        });
        return { container, onCreated, onClose };
    };

    it('trims, crops, uploads, and registers the clip', async () => {
        transcodeClipMock.mockResolvedValue(new Blob(['edited'], { type: 'video/mp4' }));
        uploadMediaMock.mockResolvedValue('mxc://blackout/clip-media');
        createClipMock.mockResolvedValue({ id: 'clip-1', title: 'My clip' });

        const { container, onCreated } = await mount();

        const fileInput = container.querySelector<HTMLInputElement>(
            '[data-testid="clip-composer-file"]'
        )!;
        const file = new File(['source'], 'stream-highlights.mp4', { type: 'video/mp4' });
        await act(async () => {
            Object.defineProperty(fileInput, 'files', { value: [file] });
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            await flush();
        });

        const inputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
        await act(async () => {
            setValue(inputs[0]!, '5');
            setValue(inputs[1]!, '35');
            await flush();
        });

        await act(async () => {
            container
                .querySelector<HTMLButtonElement>('[data-testid="clip-composer-submit"]')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });

        expect(transcodeClipMock).toHaveBeenCalledWith(
            file,
            { startSeconds: 5, endSeconds: 35, vertical: true },
            expect.any(Function)
        );
        expect(uploadMediaMock).toHaveBeenCalled();
        expect(createClipMock).toHaveBeenCalledWith({
            creatorId: '@creator:test',
            title: 'stream-highlights',
            mediaPointer: 'mxc://blackout/clip-media',
            durationSeconds: 30,
            tags: [],
        });
        expect(onCreated).toHaveBeenCalledWith({ id: 'clip-1', title: 'My clip' });
    });

    it('rejects an inverted trim window without touching the pipeline', async () => {
        const { container } = await mount();
        const fileInput = container.querySelector<HTMLInputElement>(
            '[data-testid="clip-composer-file"]'
        )!;
        const file = new File(['source'], 'clip.mp4', { type: 'video/mp4' });
        await act(async () => {
            Object.defineProperty(fileInput, 'files', { value: [file] });
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            await flush();
        });
        const inputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
        await act(async () => {
            setValue(inputs[0]!, '40');
            setValue(inputs[1]!, '10');
            await flush();
        });
        await act(async () => {
            container
                .querySelector<HTMLButtonElement>('[data-testid="clip-composer-submit"]')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });
        expect(
            container.querySelector('[data-testid="clip-composer-error"]')?.textContent
        ).toContain('trim window');
        expect(transcodeClipMock).not.toHaveBeenCalled();
    });

    it('surfaces transcode failures and returns to idle', async () => {
        transcodeClipMock.mockRejectedValue(new Error('wasm exploded'));
        const { container, onCreated } = await mount();
        const fileInput = container.querySelector<HTMLInputElement>(
            '[data-testid="clip-composer-file"]'
        )!;
        const file = new File(['source'], 'clip.mp4', { type: 'video/mp4' });
        await act(async () => {
            Object.defineProperty(fileInput, 'files', { value: [file] });
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            await flush();
        });
        const inputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
        await act(async () => {
            setValue(inputs[1]!, '30');
            await flush();
        });
        await act(async () => {
            container
                .querySelector<HTMLButtonElement>('[data-testid="clip-composer-submit"]')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });
        expect(
            container.querySelector('[data-testid="clip-composer-error"]')?.textContent
        ).toContain('wasm exploded');
        expect(onCreated).not.toHaveBeenCalled();
        expect(uploadMediaMock).not.toHaveBeenCalled();
    });
});
