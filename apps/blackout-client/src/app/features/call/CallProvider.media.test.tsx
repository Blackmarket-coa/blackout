// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

type FakeTrack = {
    kind: string;
    enabled: boolean;
    stop: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    _endedHandlers: Array<() => void>;
};

const makeTrack = (kind: string): FakeTrack => {
    const handlers: Array<() => void> = [];
    return {
        kind,
        enabled: true,
        stop: vi.fn(),
        addEventListener: vi.fn((event: string, cb: () => void) => {
            if (event === 'ended') handlers.push(cb);
        }),
        _endedHandlers: handlers,
    };
};

const makeStream = (kinds: string[]) => {
    const tracks = kinds.map(makeTrack);
    return {
        tracks,
        getTracks: () => tracks,
        getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
        getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    };
};

const deviceStreams: ReturnType<typeof makeStream>[] = [];
const displayStreams: ReturnType<typeof makeStream>[] = [];
const getUserMedia = vi.fn(async (_constraints: unknown) => {
    const stream = makeStream(['audio', 'video']);
    deviceStreams.push(stream);
    return stream;
});
const getDisplayMedia = vi.fn(async () => {
    const stream = makeStream(['video']);
    displayStreams.push(stream);
    return stream;
});

const setLocalMediaStream = vi.fn(async () => {});
const joinRoomSession = vi.fn(async () => {});
const startRoomSession = vi.fn(async () => ({
    joinRoomSession,
    leaveRoomSession: vi.fn(async () => {}),
    stop: vi.fn(),
    setLocalMediaStream,
}));

vi.mock('../../hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getHomeserverUrl: () => 'https://hs.example',
        matrixRTC: { startRoomSession },
        on: () => {},
        off: () => {},
    }),
}));

vi.mock('../../sdk/client', () => ({
    clientQueries: { getWellKnownMatrixClient: vi.fn(async () => ({})) },
}));

import { CallProvider, useCall } from './CallProvider';

type CallApi = ReturnType<typeof useCall>;

let api: CallApi | null = null;
const Consumer = () => {
    const value = useCall();
    useEffect(() => {
        api = value;
    }, [value]);
    return null;
};

const lastConstraints = () =>
    getUserMedia.mock.calls[getUserMedia.mock.calls.length - 1]?.[0] as
        | { video?: unknown }
        | undefined;

const flush = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};

const mountAndJoin = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <CallProvider>
                <Consumer />
            </CallProvider>
        );
        await Promise.resolve();
    });
    await act(async () => {
        await api!.joinCall('!room:hs.example');
    });
    await flush();
};

beforeEach(() => {
    document.body.innerHTML = '';
    api = null;
    deviceStreams.length = 0;
    displayStreams.length = 0;
    getUserMedia.mockClear();
    getDisplayMedia.mockClear();
    setLocalMediaStream.mockClear();
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia, getDisplayMedia },
    });
});

describe('CallProvider media controls', () => {
    it('mutes and unmutes the local audio track', async () => {
        await mountAndJoin();
        const audio = deviceStreams[0].getAudioTracks()[0];
        expect(audio.enabled).toBe(true);

        await act(async () => api!.setMuted(true));
        expect(audio.enabled).toBe(false);

        await act(async () => api!.setMuted(false));
        expect(audio.enabled).toBe(true);
    });

    it('re-acquires media with video when the camera is enabled', async () => {
        await mountAndJoin();
        expect(lastConstraints()?.video ?? false).toBeFalsy();

        await act(async () => api!.setCameraEnabled(true));
        await flush();
        expect(lastConstraints()?.video).toBeTruthy();
    });

    it('captures and publishes a screen share, then restores the device stream on stop', async () => {
        await mountAndJoin();
        setLocalMediaStream.mockClear();

        await act(async () => api!.setScreenSharing(true));
        await flush();

        expect(getDisplayMedia).toHaveBeenCalledTimes(1);
        const display = displayStreams[0];
        expect(setLocalMediaStream).toHaveBeenCalledWith(display);

        await act(async () => api!.setScreenSharing(false));
        await flush();

        // Display tracks stopped and the camera/mic device stream re-published.
        expect(display.getTracks()[0].stop).toHaveBeenCalled();
        const device = deviceStreams[deviceStreams.length - 1];
        expect(setLocalMediaStream).toHaveBeenLastCalledWith(device);
    });

    it('resets the toggle when the browser ends the screen share', async () => {
        await mountAndJoin();
        await act(async () => api!.setScreenSharing(true));
        await flush();
        expect(api!.screenSharing).toBe(true);

        // Simulate the browser "Stop sharing" control firing the track `ended` event.
        const endedTrack = displayStreams[0].getVideoTracks()[0];
        await act(async () => {
            endedTrack._endedHandlers.forEach((cb) => cb());
            await Promise.resolve();
        });
        expect(api!.screenSharing).toBe(false);
    });

    it('stops the display stream when leaving the call', async () => {
        await mountAndJoin();
        await act(async () => api!.setScreenSharing(true));
        await flush();
        const display = displayStreams[0];

        await act(async () => {
            await api!.leaveCall();
        });
        expect(display.getTracks()[0].stop).toHaveBeenCalled();
    });
});
