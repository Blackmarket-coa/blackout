import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Opt-in ambient soundscape for the home page. Solarpunk UIs benefit from a
 * low, living hum, but autoplay is hostile, so this is **off by default**,
 * starts only from the user's toggle gesture, and persists the choice.
 *
 * No looping ambience ships in the repo yet, so `AMBIENT_SOUND_URL` is null and
 * playback is a graceful no-op; dropping a loopable asset here lights it up
 * without touching callers. `supported` lets the UI reflect that state.
 */
const AMBIENT_SOUND_URL: string | null = null;
const STORAGE_KEY = 'blackout.home.ambientSound.v1';

const readStoredPref = (): boolean => {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
        return false;
    }
};

const writeStoredPref = (enabled: boolean): void => {
    try {
        window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
        /* storage unavailable (private mode / jsdom) — pref is best-effort */
    }
};

export interface AmbientSound {
    enabled: boolean;
    supported: boolean;
    toggle: () => void;
}

export const useAmbientSound = (): AmbientSound => {
    const supported = AMBIENT_SOUND_URL !== null && typeof Audio !== 'undefined';
    const [enabled, setEnabled] = useState(() => (supported ? readStoredPref() : false));
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (!supported || !enabled) {
            audioRef.current?.pause();
            return;
        }
        if (!audioRef.current) {
            const audio = new Audio(AMBIENT_SOUND_URL as string);
            audio.loop = true;
            audio.volume = 0.18;
            audioRef.current = audio;
        }
        // Play is user-gesture initiated (the toggle), so the promise resolves;
        // swallow the rejection if a browser still blocks it.
        void audioRef.current.play().catch(() => undefined);
        return () => audioRef.current?.pause();
    }, [enabled, supported]);

    const toggle = useCallback(() => {
        setEnabled((prev) => {
            const next = !prev;
            writeStoredPref(next);
            return next;
        });
    }, []);

    return { enabled, supported, toggle };
};
