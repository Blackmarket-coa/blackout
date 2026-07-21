// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const previewStartMock = vi.fn();
const previewStopMock = vi.fn();
const recordStartMock = vi.fn();
const recordStopMock = vi.fn();
const readFileMock = vi.fn();
const flipMock = vi.fn();
const concatMock = vi.fn();

vi.mock('../../../../src/platform/nativeMediaBridge', () => ({
    nativeCameraPreviewStart: (...args: unknown[]) => previewStartMock(...args),
    nativeCameraPreviewStop: (...args: unknown[]) => previewStopMock(...args),
    nativeCameraRecordStart: (...args: unknown[]) => recordStartMock(...args),
    nativeCameraRecordStop: (...args: unknown[]) => recordStopMock(...args),
    readNativeFileAsBlob: (...args: unknown[]) => readFileMock(...args),
    nativeCameraFlip: (...args: unknown[]) => flipMock(...args),
}));
vi.mock('../../../../src/app/features/streaming/composer/clipTranscode', () => ({
    concatClips: (...args: unknown[]) => concatMock(...args),
}));

import NativeCameraRecorder from '../../../../src/app/features/coalition/composer/NativeCameraRecorder';

const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('NativeCameraRecorder', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        for (const mock of [
            previewStartMock,
            previewStopMock,
            recordStartMock,
            recordStopMock,
            readFileMock,
            flipMock,
            concatMock,
        ]) {
            mock.mockReset();
        }
        previewStartMock.mockResolvedValue(true);
        previewStopMock.mockResolvedValue(undefined);
        recordStartMock.mockResolvedValue(true);
        recordStopMock.mockResolvedValue('/tmp/seg.mp4');
        readFileMock.mockResolvedValue(new Blob(['seg'], { type: 'video/mp4' }));
    });

    const mount = async () => {
        const onRecorded = vi.fn();
        const onClose = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(<NativeCameraRecorder onRecorded={onRecorded} onClose={onClose} />);
            await flush();
        });
        return { container, root, onRecorded, onClose };
    };

    const query = (container: HTMLElement, testid: string): HTMLElement => {
        const el = container.querySelector(`[data-testid="${testid}"]`);
        if (!el) throw new Error(`missing testid ${testid}`);
        return el as HTMLElement;
    };

    const fire = async (el: Element, type: string) => {
        await act(async () => {
            el.dispatchEvent(new Event(type, { bubbles: true }));
            await flush();
        });
    };

    /** One press-and-hold cycle long enough to beat the accidental-tap guard. */
    const recordSegment = async (container: HTMLElement) => {
        const now = vi.spyOn(performance, 'now');
        now.mockReturnValue(1000);
        await fire(query(container, 'native-camera-record'), 'pointerdown');
        now.mockReturnValue(3000);
        await fire(query(container, 'native-camera-record'), 'pointerup');
        now.mockRestore();
    };

    it('opens the native viewfinder on mount and tears it down on unmount', async () => {
        const { root } = await mount();
        expect(previewStartMock).toHaveBeenCalledWith('rear');
        await act(async () => {
            root.unmount();
            await flush();
        });
        expect(previewStopMock).toHaveBeenCalled();
    });

    it('records a hold-to-record segment and uses it on Done', async () => {
        const { container, onRecorded } = await mount();
        await recordSegment(container);
        expect(recordStartMock).toHaveBeenCalledWith(60);
        expect(recordStopMock).toHaveBeenCalled();

        await fire(query(container, 'native-camera-done'), 'click');
        expect(concatMock).not.toHaveBeenCalled();
        const [file] = onRecorded.mock.calls[0] as [File];
        expect(file.type).toBe('video/mp4');
    });

    it('drops sub-300ms accidental taps but still stops the recorder', async () => {
        const { container } = await mount();
        const now = vi.spyOn(performance, 'now');
        now.mockReturnValue(1000);
        await fire(query(container, 'native-camera-record'), 'pointerdown');
        now.mockReturnValue(1100);
        await fire(query(container, 'native-camera-record'), 'pointerup');
        now.mockRestore();

        expect(recordStopMock).toHaveBeenCalled();
        expect(query(container, 'native-camera-status').textContent).toContain('Hold to record');
    });

    it('stitches multiple takes through concatClips', async () => {
        concatMock.mockResolvedValue(new Blob(['joined'], { type: 'video/mp4' }));
        const { container, onRecorded } = await mount();
        await recordSegment(container);
        await recordSegment(container);

        await fire(query(container, 'native-camera-done'), 'click');
        expect(concatMock).toHaveBeenCalledTimes(1);
        expect((concatMock.mock.calls[0][0] as Blob[]).length).toBe(2);
        expect(onRecorded).toHaveBeenCalled();
    });

    it('falls back to the first take with a notice when the stitch engine is missing', async () => {
        concatMock.mockRejectedValue(
            new Error('Clip editing engine is not installed on this deployment (missing).')
        );
        const { container, onRecorded } = await mount();
        await recordSegment(container);
        await recordSegment(container);

        await fire(query(container, 'native-camera-done'), 'click');
        const [file, notice] = onRecorded.mock.calls[0] as [File, string];
        expect(file.type).toBe('video/mp4');
        expect(notice).toMatch(/first take/);
    });
});
