import { useEffect, useRef } from 'react';
import { useCall } from './CallProvider';

/**
 * Local screen-share preview tile (Workstream D: "call rail,
 * screen-share preview"). Binds a muted <video> to the live display
 * stream the CallProvider captured, so the sharer can see exactly what
 * they are broadcasting. Renders nothing when no share is active.
 */
export const ScreenSharePreview = () => {
    const { screenSharing, displayStream, setScreenSharing } = useCall();
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return undefined;
        if (displayStream) {
            video.srcObject = displayStream;
            try {
                void video.play?.()?.catch?.(() => undefined);
            } catch {
                // jsdom's play() throws synchronously; autoplay handles the browser.
            }
        }
        return () => {
            video.srcObject = null;
        };
    }, [displayStream]);

    if (!screenSharing || !displayStream) return null;

    return (
        <div
            data-testid="screen-share-preview"
            style={{
                position: 'relative',
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid var(--border-default)',
                background: '#000',
            }}
        >
            <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                aria-label="Your screen share preview"
                style={{ display: 'block', width: '100%', maxHeight: 220 }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: 6,
                    left: 8,
                    fontSize: 11,
                    color: '#fff',
                    background: 'rgba(0,0,0,.55)',
                    borderRadius: 4,
                    padding: '2px 6px',
                }}
            >
                You are sharing your screen
            </div>
            <button
                type="button"
                onClick={() => setScreenSharing(false)}
                style={{
                    position: 'absolute',
                    top: 4,
                    right: 6,
                    fontSize: 11,
                    border: 'none',
                    borderRadius: 4,
                    padding: '2px 8px',
                    background: 'var(--accent-danger, #d33)',
                    color: '#fff',
                    cursor: 'pointer',
                }}
            >
                Stop
            </button>
        </div>
    );
};

export default ScreenSharePreview;
