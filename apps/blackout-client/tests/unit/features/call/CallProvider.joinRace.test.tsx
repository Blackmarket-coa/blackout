// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider as JotaiProvider, createStore } from 'jotai';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { CallProvider, useCall } from '../../../../src/app/features/call/CallProvider';
import { MatrixClientProvider } from '../../../../src/app/hooks/useMatrixClient';
import { clientQueries } from '../../../../src/app/sdk/client';

const makeDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
};

const renderProvider = () => {
    const startRoomSession = vi.fn();
    const joinRoomSession = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(clientQueries, 'getWellKnownMatrixClient').mockResolvedValue({
        'org.matrix.msc4143.rtc_foci': [{ type: 'livekit', livekit_service_url: 'https://lk.example' }],
    } as unknown as Awaited<ReturnType<typeof clientQueries.getWellKnownMatrixClient>>);

    const fakeClient = {
        getHomeserverUrl: () => 'https://hs.example',
        on: vi.fn(),
        off: vi.fn(),
        matrixRTC: { startRoomSession },
    } as unknown as Parameters<typeof MatrixClientProvider>[0]['value'];

    const captured: { joinCall?: (roomId: string) => Promise<void> } = {};
    const Probe = () => {
        const ctx = useCall();
        captured.joinCall = ctx.joinCall;
        return null;
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const store = createStore();

    return {
        store,
        startRoomSession,
        joinRoomSession,
        captured,
        mount: async () =>
            act(async () => {
                root.render(
                    <JotaiProvider store={store}>
                        <MatrixClientProvider value={fakeClient}>
                            <CallProvider>
                                <Probe />
                            </CallProvider>
                        </MatrixClientProvider>
                    </JotaiProvider>,
                );
                await Promise.resolve();
                await Promise.resolve();
            }),
        unmount: () =>
            act(async () => {
                root.unmount();
            }),
    };
};

describe('CallProvider joinCall race', () => {
    beforeEach(() => {
        const stubStream = { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] };
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn().mockResolvedValue(stubStream) },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('coalesces concurrent joinCall(roomId) into a single session start', async () => {
        const { startRoomSession, joinRoomSession, mount, captured, unmount } = renderProvider();

        const deferred = makeDeferred<{
            joinRoomSession: typeof joinRoomSession;
            setLocalMediaStream: () => void;
        }>();
        startRoomSession.mockImplementation(() => deferred.promise);

        await mount();
        expect(captured.joinCall).toBeDefined();

        let firstResolved = false;
        let secondResolved = false;

        await act(async () => {
            void captured.joinCall!('!room:hs').then(() => {
                firstResolved = true;
            });
            void captured.joinCall!('!room:hs').then(() => {
                secondResolved = true;
            });
            await Promise.resolve();
        });

        expect(startRoomSession).toHaveBeenCalledTimes(1);

        await act(async () => {
            deferred.resolve({
                joinRoomSession,
                setLocalMediaStream: () => undefined,
            });
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(firstResolved).toBe(true);
        expect(secondResolved).toBe(true);
        expect(joinRoomSession).toHaveBeenCalledTimes(1);

        await unmount();
    });
});
