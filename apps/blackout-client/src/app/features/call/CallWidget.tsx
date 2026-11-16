import { useEffect, useMemo, useRef, useState } from 'react';
import { useCall } from './CallProvider';

interface ElementCallSdkApi {
    mount: (container: HTMLElement, options: Record<string, unknown>) => void;
    unmount?: () => void;
    setMuted?: (value: boolean) => void;
    setCameraEnabled?: (value: boolean) => void;
}

declare global {
    interface Window {
        ElementCallSdk?: ElementCallSdkApi;
    }
}

const postToWidget = (targetWindow: Window, payload: Record<string, unknown>) => {
    targetWindow.postMessage(payload, '*');
};

/** Where Element Call is loaded from when no other address is given. */
const DEFAULT_ELEMENT_CALL_URL = 'https://call.element.io';

/**
 * What is said before Element Call is loaded. It is a page from another
 * service: loading it sends that service the person's network address and
 * the room's ID (in the address below). Until 2026-11-16 it loaded as soon as
 * someone joined a voice channel or a stage, with nothing said
 * (trust-claims-2026-11-16.md, T17).
 */
export const elementCallNotice = (host: string): string =>
    host === 'call.element.io'
        ? "Element Call opens here as a page from call.element.io, a service run by Element, not by this server. Opening it sends that service your network address and this room's ID."
        : `Element Call opens here as a page from ${host}. Opening it sends that service your network address and this room's ID.`;

export const CallWidget = ({
    roomId,
    mode = 'sdk',
    widgetUrl,
}: {
    roomId: string;
    mode?: 'widget' | 'sdk';
    widgetUrl?: string;
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [sdkReady, setSdkReady] = useState(false);
    // Nothing from the other service loads until the person asks for it.
    const [opened, setOpened] = useState(false);
    const { muted, cameraEnabled, updateAudioLevels } = useCall();

    const iframeSrc = useMemo(() => {
        const base = widgetUrl ?? DEFAULT_ELEMENT_CALL_URL;
        const url = new URL(base);
        url.searchParams.set('roomId', roomId);
        url.searchParams.set('mode', 'widget');
        url.searchParams.set('sdk', mode === 'sdk' ? '1' : '0');
        return url.toString();
    }, [mode, roomId, widgetUrl]);

    useEffect(() => {
        if (!opened) return;
        if (mode !== 'sdk' || !containerRef.current || !window.ElementCallSdk) return;

        window.ElementCallSdk.mount(containerRef.current, {
            roomId,
            onParticipantsAudioLevel: (
                participants: Array<{ userId: string; audioLevel: number }>
            ) => {
                updateAudioLevels(
                    participants.map((item) => ({
                        userId: item.userId,
                        level: item.audioLevel,
                        speaking: item.audioLevel > 0.08,
                    }))
                );
            },
        });

        setSdkReady(true);
        return () => {
            window.ElementCallSdk?.unmount?.();
            setSdkReady(false);
        };
    }, [mode, opened, roomId, updateAudioLevels]);

    useEffect(() => {
        if (!iframeRef.current?.contentWindow) return;
        postToWidget(iframeRef.current.contentWindow, {
            api: 'fromWidget',
            action: 'io.element.call.set_media',
            data: { microphoneMuted: muted, cameraEnabled },
        });
    }, [cameraEnabled, muted]);

    useEffect(() => {
        const onWidgetMessage = (event: MessageEvent) => {
            if (!event.data || typeof event.data !== 'object') return;
            const payload = event.data as Record<string, unknown>;

            if (
                payload.action === 'io.element.call.audio_levels' &&
                Array.isArray(payload.levels)
            ) {
                const levels = payload.levels
                    .map((item) => {
                        if (!item || typeof item !== 'object') return null;
                        const chunk = item as Record<string, unknown>;
                        if (
                            typeof chunk.userId !== 'string' ||
                            typeof chunk.audioLevel !== 'number'
                        )
                            return null;
                        return {
                            userId: chunk.userId,
                            level: chunk.audioLevel,
                            speaking: chunk.audioLevel > 0.08,
                        };
                    })
                    .filter(
                        (item): item is { userId: string; level: number; speaking: boolean } =>
                            item !== null
                    );

                updateAudioLevels(levels);
            }
        };

        window.addEventListener('message', onWidgetMessage);
        return () => window.removeEventListener('message', onWidgetMessage);
    }, [updateAudioLevels]);

    if (!opened) {
        return (
            <div
                data-testid="element-call-consent"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                    fontSize: 13,
                }}
            >
                <span>{elementCallNotice(new URL(iframeSrc).host)}</span>
                <button type="button" onClick={() => setOpened(true)}>
                    Open Element Call
                </button>
            </div>
        );
    }

    if (mode === 'sdk') {
        return (
            <div style={{ width: '100%', minHeight: 240 }}>
                <div
                    ref={containerRef}
                    style={{ width: '100%', minHeight: 240, display: sdkReady ? 'block' : 'none' }}
                />
                {!sdkReady ? (
                    <iframe
                        ref={iframeRef}
                        src={iframeSrc}
                        title="Element Call"
                        style={{
                            width: '100%',
                            minHeight: 240,
                            border: '1px solid var(--border-default)',
                            borderRadius: 10,
                        }}
                        allow="camera; microphone; fullscreen; display-capture"
                    />
                ) : null}
            </div>
        );
    }

    return (
        <iframe
            ref={iframeRef}
            src={iframeSrc}
            title="Element Call"
            style={{
                width: '100%',
                minHeight: 240,
                border: '1px solid var(--border-default)',
                borderRadius: 10,
            }}
            allow="camera; microphone; fullscreen; display-capture"
        />
    );
};

export default CallWidget;
