import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { MatrixClient, MatrixEvent, RoomState } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import {
    getActionableCallMessage,
    resolveLivekitFocusFromWellKnown,
    type CallFocusResolution,
} from './callHealth';

const MSC3401_EVENT_TYPES = ['m.call.member', 'org.matrix.msc3401.call.member'];

export interface CallMemberState {
    userId: string;
    deviceId?: string;
    membership: 'joined' | 'left';
    expiresTs?: number;
    fociPreferred?: string[];
}

export interface AudioLevelState {
    userId: string;
    level: number;
    speaking: boolean;
}

interface MatrixRtcSessionLike {
    stop?: () => void;
    joinRoomSession?: () => Promise<void>;
    leaveRoomSession?: () => Promise<void>;
    setLocalMediaStream?: (stream: unknown) => Promise<void> | void;
    setAudioInputDevice?: (deviceId: string) => Promise<void> | void;
    setVideoInputDevice?: (deviceId: string) => Promise<void> | void;
}

interface MatrixRtcSessionStarter {
    matrixRTC?: {
        startRoomSession?: (
            roomId: string,
            options?: Record<string, unknown>,
        ) => Promise<MatrixRtcSessionLike>;
    };
}

interface CallContextValue {
    roomId: string | null;
    joined: boolean;
    muted: boolean;
    deafened: boolean;
    cameraEnabled: boolean;
    screenSharing: boolean;
    focusUrl: string | null;
    focusStatus: CallFocusResolution['status'];
    focusReason: string;
    focusMessage: string;
    membership: Record<string, CallMemberState>;
    audioLevels: Record<string, AudioLevelState>;
    joinCall: (roomId: string) => Promise<void>;
    leaveCall: () => Promise<void>;
    setMuted: (value: boolean) => void;
    setDeafened: (value: boolean) => void;
    setCameraEnabled: (value: boolean) => void;
    setScreenSharing: (value: boolean) => void;
    updateAudioLevels: (levels: AudioLevelState[]) => void;
    preferredAudioDeviceId: string | null;
    preferredVideoDeviceId: string | null;
    setPreferredAudioDeviceId: (deviceId: string | null) => void;
    setPreferredVideoDeviceId: (deviceId: string | null) => void;
}

const CallContext = createContext<CallContextValue | null>(null);

const parseMembership = (event: MatrixEvent): CallMemberState | null => {
    const content = event.getContent() as Record<string, unknown>;
    const userId = event.getSender();
    if (!userId) return null;

    const deviceId = typeof content.device_id === 'string' ? content.device_id : undefined;
    const expiresTs = typeof content.expires_ts === 'number' ? content.expires_ts : undefined;
    const membershipRaw = typeof content.membership === 'string' ? content.membership : 'joined';
    const membership = membershipRaw === 'leave' || membershipRaw === 'left' ? 'left' : 'joined';

    let fociPreferred: string[] | undefined;
    if (Array.isArray(content.foci_preferred)) {
        fociPreferred = content.foci_preferred.filter(
            (item): item is string => typeof item === 'string',
        );
    }

    return { userId, deviceId, expiresTs, membership, fociPreferred };
};

const readRtcFocus = async (client: MatrixClient): Promise<CallFocusResolution> => {
    const homeserverUrl = client.getHomeserverUrl();
    const wellKnownUrl = new URL('/.well-known/matrix/client', homeserverUrl).toString();

    try {
        const response = await fetch(wellKnownUrl, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
            return { focusUrl: null, status: 'degraded', reason: `well-known HTTP ${response.status}` };
        }

        const body = (await response.json()) as Record<string, unknown>;
        const focusUrl = resolveLivekitFocusFromWellKnown(body);
        if (!focusUrl) {
            return { focusUrl: null, status: 'unconfigured', reason: 'missing rtc_foci livekit entry' };
        }

        return { focusUrl, status: 'healthy', reason: 'resolved from well-known' };
    } catch (error) {
        return {
            focusUrl: null,
            status: 'degraded',
            reason: error instanceof Error ? error.message : 'fetch failed',
        };
    }
};

const getSessionStarter = (client: MatrixClient): MatrixRtcSessionStarter =>
    client as unknown as MatrixRtcSessionStarter;

export const CallProvider = ({ children }: { children: ReactNode }) => {
    const client = useMatrixClient();

    const [roomId, setRoomId] = useState<string | null>(null);
    const [joined, setJoined] = useState(false);
    const [muted, setMuted] = useState(false);
    const [deafened, setDeafened] = useState(false);
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [screenSharing, setScreenSharing] = useState(false);
    const [focusUrl, setFocusUrl] = useState<string | null>(null);
    const [focusStatus, setFocusStatus] = useState<CallFocusResolution['status']>('unconfigured');
    const [focusReason, setFocusReason] = useState('not loaded');
    const [preferredAudioDeviceId, setPreferredAudioDeviceId] = useState<string | null>(null);
    const [preferredVideoDeviceId, setPreferredVideoDeviceId] = useState<string | null>(null);
    const [membership, setMembership] = useState<Record<string, CallMemberState>>({});
    const [audioLevels, setAudioLevels] = useState<Record<string, AudioLevelState>>({});

    const activeSessionRef = useRef<MatrixRtcSessionLike | null>(null);
    const activeDeviceStreamRef = useRef<{ getTracks: () => Array<{ stop: () => void }> } | null>(
        null,
    );

    useEffect(() => {
        let mounted = true;
        void readRtcFocus(client).then((result) => {
            if (!mounted) return;
            setFocusUrl(result.focusUrl);
            setFocusStatus(result.status);
            setFocusReason(result.reason);
        });

        return () => {
            mounted = false;
        };
    }, [client]);

    useEffect(() => {
        if (!joined || !navigator.mediaDevices?.getUserMedia) return;

        const constraints = {
            audio: preferredAudioDeviceId ? { deviceId: { exact: preferredAudioDeviceId } } : true,
            video: preferredVideoDeviceId ? { deviceId: { exact: preferredVideoDeviceId } } : false,
        };

        let cancelled = false;
        void navigator.mediaDevices.getUserMedia(constraints).then(async (stream) => {
            if (cancelled) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            const session = activeSessionRef.current;
            if (session?.setAudioInputDevice && preferredAudioDeviceId) {
                await session.setAudioInputDevice(preferredAudioDeviceId);
            }
            if (session?.setVideoInputDevice && preferredVideoDeviceId) {
                await session.setVideoInputDevice(preferredVideoDeviceId);
            }
            if (session?.setLocalMediaStream) {
                await session.setLocalMediaStream(stream);
            }

            activeDeviceStreamRef.current?.getTracks().forEach((track) => track.stop());
            activeDeviceStreamRef.current = stream;
        });

        return () => {
            cancelled = true;
        };
    }, [joined, preferredAudioDeviceId, preferredVideoDeviceId]);

    useEffect(() => {
        const emitter = client as unknown as {
            on: (event: string, cb: (event: MatrixEvent, state: RoomState) => void) => void;
            off: (event: string, cb: (event: MatrixEvent, state: RoomState) => void) => void;
        };

        const onRoomStateEvent = (event: MatrixEvent, state: RoomState) => {
            if (!roomId || state.roomId !== roomId) return;
            if (!MSC3401_EVENT_TYPES.includes(event.getType())) return;

            const member = parseMembership(event);
            if (!member) return;

            setMembership((prev) => ({ ...prev, [member.userId]: member }));
        };

        emitter.on('RoomState.events', onRoomStateEvent);
        return () => {
            emitter.off('RoomState.events', onRoomStateEvent);
        };
    }, [client, roomId]);

    const leaveCall = useCallback(async () => {
        await activeSessionRef.current?.leaveRoomSession?.();
        activeSessionRef.current?.stop?.();

        activeSessionRef.current = null;
        activeDeviceStreamRef.current?.getTracks().forEach((track) => track.stop());
        activeDeviceStreamRef.current = null;
        setJoined(false);
        setRoomId(null);
        setMembership({});
        setAudioLevels({});
        setScreenSharing(false);
        setCameraEnabled(false);
    }, []);

    const joinCall = useCallback(
        async (nextRoomId: string) => {
            if (roomId && roomId !== nextRoomId) {
                await leaveCall();
            }

            setRoomId(nextRoomId);

            const matrixRtc = getSessionStarter(client).matrixRTC;
            if (!matrixRtc?.startRoomSession) {
                setFocusStatus('degraded');
                setFocusReason('matrixRTC startRoomSession unavailable');
                setJoined(true);
                return;
            }

            try {
                const session = await matrixRtc.startRoomSession(nextRoomId, {
                    manageMediaKeys: true,
                    focusPreferred: focusUrl ? [focusUrl] : undefined,
                });

                await session.joinRoomSession?.();
                activeSessionRef.current = session;
                setJoined(true);
            } catch (error) {
                setFocusStatus('degraded');
                setFocusReason(error instanceof Error ? error.message : 'session start failed');
                setJoined(true);
            }
        },
        [client, focusUrl, leaveCall, roomId],
    );

    const updateAudioLevels = useCallback((levels: AudioLevelState[]) => {
        setAudioLevels((prev) => {
            const next = { ...prev };
            levels.forEach((level) => {
                next[level.userId] = level;
            });
            return next;
        });
    }, []);

    const value = useMemo<CallContextValue>(
        () => ({
            roomId,
            joined,
            muted,
            deafened,
            cameraEnabled,
            screenSharing,
            focusUrl,
            focusStatus,
            focusReason,
            focusMessage: getActionableCallMessage(focusStatus, focusReason),
            membership,
            audioLevels,
            joinCall,
            leaveCall,
            setMuted,
            setDeafened,
            setCameraEnabled,
            setScreenSharing,
            updateAudioLevels,
            preferredAudioDeviceId,
            preferredVideoDeviceId,
            setPreferredAudioDeviceId,
            setPreferredVideoDeviceId,
        }),
        [
            audioLevels,
            cameraEnabled,
            deafened,
            focusReason,
            focusStatus,
            focusUrl,
            joinCall,
            joined,
            leaveCall,
            membership,
            muted,
            preferredAudioDeviceId,
            preferredVideoDeviceId,
            roomId,
            screenSharing,
            updateAudioLevels,
        ],
    );

    return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCall = (): CallContextValue => {
    const context = useContext(CallContext);
    if (!context) {
        throw new Error('useCall must be used within a CallProvider.');
    }
    return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useOptionalCall = (): CallContextValue | null => useContext(CallContext);
