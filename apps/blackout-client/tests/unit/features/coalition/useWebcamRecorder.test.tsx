// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

import {
    useWebcamRecorder,
    webcamRecordingSupported,
    type UseWebcamRecorderResult,
} from '../../../../src/app/features/coalition/composer/useWebcamRecorder';

/** Minimal MediaRecorder stand-in driving the ondataavailable/onstop contract. */
class FakeMediaRecorder {
    static instances: FakeMediaRecorder[] = [];
    static isTypeSupported = (type: string) => type === 'video/webm';
    mimeType: string;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(_stream: unknown, opts?: { mimeType?: string }) {
        this.mimeType = opts?.mimeType ?? 'video/webm';
        FakeMediaRecorder.instances.push(this);
    }
    start() {}
    stop() {
        this.ondataavailable?.({ data: new Blob(['frames'], { type: this.mimeType }) });
        this.onstop?.();
    }
}

const trackStop = vi.fn();
const fakeStream = { getTracks: () => [{ stop: trackStop }] };
const getUserMedia = vi.fn(async () => fakeStream);

const Probe = ({ onResult }: { onResult: (r: UseWebcamRecorderResult) => void }) => {
    const recorder = useWebcamRecorder();
    useEffect(() => {
        onResult(recorder);
    });
    return null;
};

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('useWebcamRecorder', () => {
    beforeEach(() => {
        FakeMediaRecorder.instances = [];
        trackStop.mockReset();
        getUserMedia.mockClear();
        vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        Reflect.deleteProperty(navigator, 'mediaDevices');
        document.body.innerHTML = '';
    });

    const mount = async () => {
        let latest: UseWebcamRecorderResult | null = null;
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(
                <Probe
                    onResult={(r) => {
                        latest = r;
                    }}
                />
            );
            await flush();
        });
        return {
            root,
            current: () => latest!,
            step: async (fn: () => void | Promise<void>) => {
                await act(async () => {
                    await fn();
                    await flush();
                });
            },
        };
    };

    it('reports support when getUserMedia and MediaRecorder exist', async () => {
        expect(webcamRecordingSupported()).toBe(true);
        const probe = await mount();
        expect(probe.current().supported).toBe(true);
    });

    it('opens the camera, records a take, and produces a webm File', async () => {
        const probe = await mount();

        await probe.step(() => probe.current().open());
        expect(getUserMedia).toHaveBeenCalledWith(
            expect.objectContaining({ audio: true, video: expect.anything() })
        );
        expect(probe.current().stream).toBe(fakeStream);

        await probe.step(() => probe.current().start());
        expect(probe.current().recording).toBe(true);

        await probe.step(() => probe.current().stop());
        expect(probe.current().recording).toBe(false);
        const file = probe.current().file;
        expect(file).not.toBeNull();
        expect(file!.name).toMatch(/^recording-\d+\.webm$/);
        expect(file!.type).toBe('video/webm');
    });

    it('releases camera tracks on close', async () => {
        const probe = await mount();
        await probe.step(() => probe.current().open());
        await probe.step(() => {
            probe.current().close();
        });
        expect(trackStop).toHaveBeenCalled();
        expect(probe.current().stream).toBeNull();
    });

    it('surfaces getUserMedia rejection as error state', async () => {
        getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
        const probe = await mount();
        await probe.step(() => probe.current().open());
        expect(probe.current().error?.message).toBe('Permission denied');
        expect(probe.current().stream).toBeNull();
    });
});
