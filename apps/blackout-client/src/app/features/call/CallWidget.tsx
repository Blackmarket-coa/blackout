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
  const { muted, cameraEnabled, updateAudioLevels } = useCall();

  const iframeSrc = useMemo(() => {
    const base = widgetUrl ?? 'https://call.element.io';
    const url = new URL(base);
    url.searchParams.set('roomId', roomId);
    url.searchParams.set('mode', 'widget');
    url.searchParams.set('sdk', mode === 'sdk' ? '1' : '0');
    return url.toString();
  }, [mode, roomId, widgetUrl]);

  useEffect(() => {
    if (mode !== 'sdk' || !containerRef.current || !window.ElementCallSdk) return;

    window.ElementCallSdk.mount(containerRef.current, {
      roomId,
      onParticipantsAudioLevel: (participants: Array<{ userId: string; audioLevel: number }>) => {
        updateAudioLevels(
          participants.map((item) => ({
            userId: item.userId,
            level: item.audioLevel,
            speaking: item.audioLevel > 0.08,
          })),
        );
      },
    });

    setSdkReady(true);
    return () => {
      window.ElementCallSdk?.unmount?.();
      setSdkReady(false);
    };
  }, [mode, roomId, updateAudioLevels]);

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

      if (payload.action === 'io.element.call.audio_levels' && Array.isArray(payload.levels)) {
        const levels = payload.levels
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const chunk = item as Record<string, unknown>;
            if (typeof chunk.userId !== 'string' || typeof chunk.audioLevel !== 'number') return null;
            return {
              userId: chunk.userId,
              level: chunk.audioLevel,
              speaking: chunk.audioLevel > 0.08,
            };
          })
          .filter((item): item is { userId: string; level: number; speaking: boolean } => item !== null);

        updateAudioLevels(levels);
      }
    };

    window.addEventListener('message', onWidgetMessage);
    return () => window.removeEventListener('message', onWidgetMessage);
  }, [updateAudioLevels]);

  if (mode === 'sdk') {
    return (
      <div style={{ width: '100%', minHeight: 240 }}>
        <div ref={containerRef} style={{ width: '100%', minHeight: 240, display: sdkReady ? 'block' : 'none' }} />
        {!sdkReady ? (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title="Element Call"
            style={{ width: '100%', minHeight: 240, border: '1px solid var(--border-default)', borderRadius: 10 }}
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
      style={{ width: '100%', minHeight: 240, border: '1px solid var(--border-default)', borderRadius: 10 }}
      allow="camera; microphone; fullscreen; display-capture"
    />
  );
};

export default CallWidget;
