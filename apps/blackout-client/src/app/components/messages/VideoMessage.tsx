import { useMemo, useRef, useState } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { baseStyles, getInfo, useInViewport, useResolvedMediaSource } from './mediaShared';

interface VideoMessageProps {
    event: MatrixEvent;
}

export const VideoMessage = ({ event }: VideoMessageProps) => {
    const { ref, inView } = useInViewport<HTMLDivElement>();
    const { src, loading, error, encrypted } = useResolvedMediaSource(event);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [volume, setVolume] = useState(1);
    const info = getInfo(event);

    const poster = useMemo(
        () => (typeof info.thumbnail_url === 'string' ? info.thumbnail_url : undefined),
        [info.thumbnail_url],
    );

    return (
        <div ref={ref} style={{ ...baseStyles.surface, padding: 8, width: 'min(540px, 100%)' }}>
            {!inView || loading ? (
                <div style={{ ...baseStyles.skeleton, borderRadius: 8, minHeight: 180 }} />
            ) : null}
            {error ? <div style={baseStyles.error}>Video failed to load: {error}</div> : null}

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
                            onClick={() => {
                                const player = videoRef.current;
                                if (!player) return;
                                void player.requestFullscreen?.();
                            }}
                        >
                            Fullscreen
                        </button>
                    </div>
                    {encrypted ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                            Encrypted video
                        </div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
};

export default VideoMessage;
