import { useCallback, useMemo, useRef, useState } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import {
    MediaLoadError,
    ServerReadableNote,
    baseStyles,
    getInfo,
    loadEncryptedLabel,
    useInViewport,
    useResolvedMediaSource,
} from './mediaShared';
import { useMediaPlaybackRate } from '../../hooks/media/useMediaPlaybackRate';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { mxcToUrl } from '../../utils/media';
import { PLAYBACK_RATES } from './AudioMessage';

interface VideoMessageProps {
    event: MatrixEvent;
}

export const VideoMessage = ({ event }: VideoMessageProps) => {
    const client = useMatrixClient();
    const { ref, inView } = useInViewport<HTMLDivElement>();
    // An encrypted video has to be downloaded whole before it can be
    // decrypted, so it is never fetched unasked: the reader loads it.
    const {
        src,
        loading,
        error,
        endToEndEncrypted,
        awaitingLoad,
        load,
        canRetry,
        sizeUnderstated,
        serverReadableNote,
    } = useResolvedMediaSource(event, { autoLoad: false });
    // The browser refused or could not decode the video it was handed.
    const [unplayable, setUnplayable] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [volume, setVolume] = useState(1);
    const info = getInfo(event);

    const getVideoElement = useCallback(() => videoRef.current, []);
    const { playbackRate, setPlaybackRate } = useMediaPlaybackRate(getVideoElement);
    const cyclePlaybackRate = useCallback(() => {
        const idx = PLAYBACK_RATES.indexOf(playbackRate as typeof PLAYBACK_RATES[number]);
        setPlaybackRate(PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length]);
    }, [playbackRate, setPlaybackRate]);

    // A poster is used only when it is an `mxc://` address, loaded from this
    // homeserver. A message can put any URL in `thumbnail_url`; handing that
    // to the browser would tell a server of the sender's choosing who is
    // looking at the message, from which address, and when.
    const homeserverUrl =
        (client as unknown as { getHomeserverUrl?: () => string }).getHomeserverUrl?.() ?? '';
    const poster = useMemo(() => {
        const thumbnail = info.thumbnail_url;
        if (typeof thumbnail !== 'string' || !homeserverUrl) return undefined;
        return mxcToUrl(thumbnail, homeserverUrl) ?? undefined;
    }, [homeserverUrl, info.thumbnail_url]);

    return (
        <div ref={ref} style={{ ...baseStyles.surface, padding: 8, width: 'min(540px, 100%)' }}>
            {!inView || loading ? (
                <div style={{ ...baseStyles.skeleton, borderRadius: 8, minHeight: 180 }} />
            ) : null}
            {error ? (
                <MediaLoadError
                    what="Video failed to load"
                    error={error}
                    onRetry={canRetry ? load : undefined}
                />
            ) : null}
            {inView && awaitingLoad ? (
                <button type="button" onClick={load} data-testid="load-encrypted-media">
                    {loadEncryptedLabel('video', info, sizeUnderstated)}
                </button>
            ) : null}

            {inView && src ? (
                <>
                    <video
                        ref={videoRef}
                        src={src}
                        poster={poster}
                        style={{ width: '100%', borderRadius: 8, background: '#000' }}
                        onTimeUpdate={(event) => {
                            const target = event.currentTarget;
                            if (!target.duration) return;
                            setProgress((target.currentTime / target.duration) * 100);
                        }}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onError={() => setUnplayable(true)}
                    />

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                        <button
                            type="button"
                            onClick={() => {
                                const player = videoRef.current;
                                if (!player) return;
                                if (player.paused) {
                                    void player.play();
                                } else {
                                    player.pause();
                                }
                            }}
                        >
                            {playing ? 'Pause' : 'Play'}
                        </button>

                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={progress}
                            onChange={(event) => {
                                const player = videoRef.current;
                                if (!player || !player.duration) return;
                                const next = Number(event.target.value);
                                player.currentTime = (next / 100) * player.duration;
                                setProgress(next);
                            }}
                            style={{ flex: 1 }}
                        />

                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={volume}
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                const player = videoRef.current;
                                if (!player) return;
                                player.volume = next;
                                setVolume(next);
                            }}
                        />

                        <button
                            type="button"
                            onClick={cyclePlaybackRate}
                            aria-label="Playback speed"
                            title="Playback speed"
                            style={{ fontSize: 12, minWidth: 44 }}
                        >
                            {playbackRate}×
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                const player = videoRef.current;
                                if (!player) return;
                                void player.requestFullscreen?.();
                            }}
                        >
                            Fullscreen
                        </button>
                    </div>
                    {endToEndEncrypted ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                            Encrypted video
                        </div>
                    ) : null}
                </>
            ) : null}
            {unplayable ? (
                <div style={baseStyles.error} data-testid="media-unplayable">
                    This video could not be played here.
                </div>
            ) : null}
            {serverReadableNote ? <ServerReadableNote text={serverReadableNote} /> : null}
        </div>
    );
};

export default VideoMessage;
