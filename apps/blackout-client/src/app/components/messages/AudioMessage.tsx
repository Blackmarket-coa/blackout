import { useMemo, useRef, useState } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { baseStyles, getInfo, useInViewport, useResolvedMediaSource } from './mediaShared';

interface AudioMessageProps {
    event: MatrixEvent;
}

const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const AudioMessage = ({ event }: AudioMessageProps) => {
    const { ref, inView } = useInViewport<HTMLDivElement>();
    const { src, loading, error } = useResolvedMediaSource(event);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [position, setPosition] = useState(0);

    const content = event.getContent<Record<string, unknown>>();
    const voice = typeof content['org.matrix.msc3245.voice'] === 'object';
    const info = getInfo(event);
    const durationSec = typeof info.duration === 'number' ? Math.floor(info.duration / 1000) : 0;

    const waveform = useMemo(
        () => Array.from({ length: 40 }, (_, i) => 20 + Math.abs(Math.sin(i / 3)) * 65),
        [],
    );

    return (
        <div ref={ref} style={{ ...baseStyles.surface, padding: 10, width: 'min(420px, 100%)' }}>
            {!inView || loading ? (
                <div style={{ ...baseStyles.skeleton, minHeight: 54, borderRadius: 8 }} />
            ) : null}
            {error ? <div style={baseStyles.error}>Audio failed to load: {error}</div> : null}

            {inView && src ? (
                <>
                    <audio
                        ref={audioRef}
                        src={src}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onTimeUpdate={(event) => {
                            const target = event.currentTarget;
                            if (!target.duration) return;
                            setPosition(target.currentTime / target.duration);
                        }}
                    />

                    {voice ? (
                        <div style={{ display: 'flex', gap: 2, alignItems: 'end', height: 52 }}>
                            {waveform.map((height, idx) => (
                                <span
                                    key={`wave-${idx}`}
                                    style={{
                                        width: 4,
                                        height: `${height * (idx / waveform.length < position ? 1 : 0.45)}%`,
                                        borderRadius: 2,
                                        background:
                                            idx / waveform.length < position
                                                ? 'var(--accent-primary)'
                                                : 'var(--accent-muted)',
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <audio controls src={src} style={{ width: '100%' }} />
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <button
                            type="button"
                            onClick={() => {
                                const player = audioRef.current;
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
                            max={1}
                            step={0.01}
                            value={position}
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                const player = audioRef.current;
                                if (!player || !player.duration) return;
                                player.currentTime = next * player.duration;
                                setPosition(next);
                            }}
                            style={{ flex: 1 }}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {formatTime(
                                (audioRef.current?.currentTime ?? position * durationSec) || 0,
                            )}{' '}
                            / {formatTime(durationSec)}
                        </span>
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default AudioMessage;
