// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

// The composer pulls the default uploader from a Matrix-backed hook; stub it so
// the component mounts without a client (tests inject their own uploader prop).
vi.mock('./videoUpload', async (importOriginal: () => Promise<Record<string, unknown>>) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useColiseumVideoUploader: () => null,
        readVideoDurationMs: () => Promise.resolve(1000),
    };
});
vi.mock('./useVideoRecorder', () => ({
    useVideoRecorder: () => ({
        supported: false,
        recording: false,
        file: null,
        error: null,
        start: vi.fn(),
        stop: vi.fn(),
        reset: vi.fn(),
        stream: null,
    }),
}));

import { VideoComposer } from './VideoComposer';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
        await flush();
    });
    return { container, root };
};

describe('VideoComposer', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uploads a picked file and submits its mxc', async () => {
        const uploader = vi.fn(async () => 'mxc://server/vid123');
        const onSubmit = vi.fn(async () => undefined);
        const { container } = await render(
            React.createElement(VideoComposer, {
                onSubmit,
                submitLabel: 'Post round',
                uploader,
            })
        );

        const input = container.querySelector(
            '[data-testid="coliseum-video-file"]'
        ) as HTMLInputElement;
        const file = new File(['x'], 'clip.webm', { type: 'video/webm' });
        Object.defineProperty(input, 'files', { value: [file] });
        await act(async () => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await flush();
        });

        const submit = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Post round')
        ) as HTMLButtonElement;
        expect(submit.disabled).toBe(false);
        await act(async () => {
            submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });

        expect(uploader).toHaveBeenCalledWith(file);
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit.mock.calls[0]![0]).toMatchObject({
            media: { kind: 'video', mxc: 'mxc://server/vid123' },
        });
    });
});
