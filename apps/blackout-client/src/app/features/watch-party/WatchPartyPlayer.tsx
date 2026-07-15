import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Room } from 'matrix-js-sdk';
import { type WatchPartyState, reconcilePlayback } from './watchPartyState';

/** How often followers re-check the shared playhead. */
const FOLLOWER_TICK_MS = 1000;
/** How often the playing host re-stamps the playhead to bound clock drift. */
const HOST_HEARTBEAT_MS = 10_000;

const playerShellStyle: CSSProperties = {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid var(--border-default)',
    background: '#000',
};

const overlayButtonStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    width: '100%',
    border: 'none',
    background: 'rgba(0,0,0,.6)',
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
};

const canPlayNativeHls = (video: HTMLVideoElement): boolean =>
    video.canPlayType('application/vnd.apple.mpegurl') !== '';

/**
 * play() with autoplay-policy handling. Browsers reject the promise when a
 * user gesture is required; jsdom's play() throws synchronously — treat both
 * as "needs a gesture" so tests and blocked autoplay share one path.
 */
const attemptPlay = (video: HTMLVideoElement, onOutcome: (blocked: boolean) => void): void => {
    try {
        const result = video.play?.() as Promise<void> | undefined;
        if (result && typeof result.then === 'function') {
            result.then(() => onOutcome(false)).catch(() => onOutcome(true));
        } else {
            onOutcome(false);
        }
    } catch {
        onOutcome(true);
    }
};

const resolveSourceUrl = (room: Room, state: WatchPartyState): string | null => {
    const source = state.source;
    if (!source) return null;
    if (source.kind === 'mxc') return room.client.mxcUrlToHttp(source.uri);
    return source.uri;
};

/**
 * The shared `<video>` surface for shared-player and live-event parties.
 * The host's transport actions (play/pause/seek/rate) publish new party
 * revisions; followers run a reconciliation loop that seeks on large drift
 * and rate-nudges small drift so playback converges without stutter.
 * HLS sources play where the browser supports HLS natively (Safari/iOS);
 * hls.js wiring stays deferred, matching the livestream viewer.
 */
export const WatchPartyPlayer = ({
    room,
    state,
    isHost,
    onAdvance,
}: {
    room: Room;
    state: WatchPartyState;
    isHost: boolean;
    onAdvance: (patch: {
        status?: WatchPartyState['status'];
        positionMs?: number;
        playbackRate?: number;
    }) => Promise<void>;
}) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    // Autoplay policy: a follower join can be blocked until a user gesture.
    const [needsGesture, setNeedsGesture] = useState(false);
    const [hlsUnsupported, setHlsUnsupported] = useState(false);

    const src = resolveSourceUrl(room, state);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;
        setHlsUnsupported(state.source?.kind === 'hls' && !canPlayNativeHls(video));
    }, [src, state.source?.kind]);

    // --- Host side: publish transport changes + heartbeat -----------------
    const publishFromElement = useCallback(
        (status?: WatchPartyState['status']) => {
            const video = videoRef.current;
            if (!video) return;
            void onAdvance({
                status: status ?? (video.paused ? 'paused' : 'playing'),
                positionMs: video.currentTime * 1000,
                playbackRate: video.playbackRate,
            });
        },
        [onAdvance]
    );

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isHost) return undefined;

        const onPlay = () => publishFromElement('playing');
        const onPause = () => publishFromElement('paused');
        const onSeeked = () => publishFromElement();
        const onRateChange = () => publishFromElement();

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('ratechange', onRateChange);
        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('ratechange', onRateChange);
        };
    }, [isHost, publishFromElement]);

    useEffect(() => {
        if (!isHost || state.status !== 'playing') return undefined;
        const timer = window.setInterval(() => publishFromElement(), HOST_HEARTBEAT_MS);
        return () => window.clearInterval(timer);
    }, [isHost, state.status, publishFromElement]);

    // --- Follower side: converge on the shared playhead -------------------
    useEffect(() => {
        if (isHost) return undefined;

        const applyTarget = () => {
            const video = videoRef.current;
            if (!video || video.seeking) return;

            const target = reconcilePlayback(
                {
                    positionMs: video.currentTime * 1000,
                    paused: video.paused,
                    playbackRate: video.playbackRate,
                },
                state,
                Date.now()
            );

            if (target.seekToMs !== null) video.currentTime = target.seekToMs / 1000;
            if (video.playbackRate !== target.playbackRate) {
                video.playbackRate = target.playbackRate;
            }
            if (target.play && video.paused) {
                attemptPlay(video, setNeedsGesture);
            } else if (!target.play && !video.paused) {
                video.pause();
            }
        };

        applyTarget();
        const timer = window.setInterval(applyTarget, FOLLOWER_TICK_MS);
        return () => window.clearInterval(timer);
    }, [isHost, state]);

    const joinPlayback = () => {
        const video = videoRef.current;
        if (!video) return;
        attemptPlay(video, setNeedsGesture);
    };

    if (!src) return null;

    if (hlsUnsupported) {
        return (
            <div style={{ ...playerShellStyle, background: 'var(--bg-input)', padding: 12 }}>
                <small style={{ color: 'var(--text-secondary)' }}>
                    This party uses an HLS stream, which this browser cannot play natively. Join
                    from Safari/iOS, or ask the host to use a direct video URL or an upload instead.
                </small>
            </div>
        );
    }

    return (
        <div data-testid="watch-party-player" style={playerShellStyle}>
            <video
                ref={videoRef}
                src={src}
                controls={isHost}
                playsInline
                aria-label={state.source?.title ?? 'Watch party video'}
                style={{ display: 'block', width: '100%', maxHeight: 320 }}
            />
            {!isHost && needsGesture ? (
                <button type="button" onClick={joinPlayback} style={overlayButtonStyle}>
                    ▶ Click to join playback
                </button>
            ) : null}
        </div>
    );
};

export default WatchPartyPlayer;
