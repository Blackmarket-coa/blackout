import { useCallback, useMemo, useRef, useState } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { baseStyles, getInfo, useInViewport, useResolvedMediaSource } from './mediaShared';
import { readWaveformHeights } from '../../features/room/voiceMessage';
import { useMediaPlaybackRate } from '../../hooks/media/useMediaPlaybackRate';

interface AudioMessageProps {
    event: MatrixEvent;
}

const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

export const AudioMessage = ({ event }: AudioMessageProps) => {
    const { ref, inView } = useInViewport<HTMLDivElement>();
    const { src, loading, error } = useResolvedMediaSource(event);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [volume, setVolume] = useState(1);

    const getAudioElement = useCallback(() => audioRef.current, []);
    const { playbackRate, setPlaybackRate } = useMediaPlaybackRate(getAudioElement);
    const cyclePlaybackRate = useCallback(() => {
        const idx = PLAYBACK_RATES.indexOf(
            playbackRate as (typeof PLAYBACK_RATES)[number],
        );
        setPlaybackRate(PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length]);
    }, [playbackRate, setPlaybackRate]);

    const content = event.getContent<Record<string, unknown>>();
    const voice = typeof content['org.matrix.msc3245.voice'] === 'object';
    const info = getInfo(event);
    const msc1767Duration = (() => {
        const audioBlock = content['org.matrix.msc1767.audio'];
        if (typeof audioBlock !== 'object' || audioBlock === null) return undefined;
        const d = (audioBlock as { duration?: unknown }).duration;
        return typeof d === 'number' ? d : undefined;
    })();
    const durationMs =
        typeof info.duration === 'number' ? info.duration : (msc1767Duration ?? 0);
    const durationSec = Math.floor(durationMs / 1000);

    // Real peaks when the sender transmitted them (MSC1767 audio block);
    // synthetic placeholder bars otherwise so old events still render.
    const waveform = useMemo(() => {
        const real = readWaveformHeights(content);
        if (real) return real.map((h) => 15 + h * 70);
        return Array.from({ length: 40 }, (_, i) => 20 + Math.abs(Math.sin(i / 3)) * 65);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event]);

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
                        <button
                            type="button"
                            onClick={cyclePlaybackRate}
                            aria-label="Playback speed"
                            title="Playback speed"
                            style={{ fontSize: 12, minWidth: 44 }}
                        >
                            {playbackRate}×
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={volume}
                            aria-label="Volume"
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                setVolume(next);
                                if (audioRef.current) audioRef.current.volume = next;
                            }}
                            style={{ width: 64 }}
                        />
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default AudioMessage;
