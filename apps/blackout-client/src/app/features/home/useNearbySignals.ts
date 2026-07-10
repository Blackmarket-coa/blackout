import { useCallback, useEffect, useState } from 'react';
import { fetchNearbySignals } from '../coalition/coalitionClient';

/**
 * Opt-in "signals nearby" state for the Home chip (OSS gap-fill WS4).
 *
 * Privacy model: nothing happens until the user explicitly enables the chip.
 * On enable we ask the browser for a position ONCE per load, round it to two
 * decimals (~1.1 km cell) before it leaves the device, ask the coalition API
 * how many located signals sit within NEARBY_RADIUS_KM, and keep only the
 * count. Raw coordinates are never stored or transmitted, and the server
 * response carries no locations either.
 */

const CONSENT_KEY = 'co.bmc.home.nearbySignals.v1';
export const NEARBY_RADIUS_KM = 10;

/** ~1.1 km grid: coarse enough to be a neighbourhood, not an address. */
export const coarsen = (value: number): number => Math.round(value * 100) / 100;

const readConsent = (): boolean => {
    try {
        return window.localStorage.getItem(CONSENT_KEY) === 'on';
    } catch {
        return false;
    }
};

const writeConsent = (enabled: boolean): void => {
    try {
        window.localStorage.setItem(CONSENT_KEY, enabled ? 'on' : 'off');
    } catch {
        // Private mode / blocked storage: consent just won't persist.
    }
};

export interface NearbySignalsState {
    enabled: boolean;
    /** Count of nearby signals; null until a fetch has succeeded. */
    count: number | null;
    loading: boolean;
    error: string | null;
    enable: () => void;
    disable: () => void;
}

export function useNearbySignals(): NearbySignalsState {
    const [enabled, setEnabled] = useState<boolean>(() => readConsent());
    const [count, setCount] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(() => {
        if (!navigator.geolocation) {
            setError('Location is unavailable on this device.');
            return;
        }
        setLoading(true);
        setError(null);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                fetchNearbySignals({
                    lat: coarsen(position.coords.latitude),
                    lng: coarsen(position.coords.longitude),
                    radiusKm: NEARBY_RADIUS_KM,
                })
                    .then((response) => {
                        setCount(response.count);
                        setLoading(false);
                    })
                    .catch(() => {
                        setError('Could not load nearby signals.');
                        setLoading(false);
                    });
            },
            () => {
                setError('Could not get your location.');
                setLoading(false);
            }
        );
    }, []);

    useEffect(() => {
        if (enabled) refresh();
    }, [enabled, refresh]);

    const enable = useCallback(() => {
        writeConsent(true);
        setEnabled(true);
    }, []);

    const disable = useCallback(() => {
        writeConsent(false);
        setEnabled(false);
        setCount(null);
        setError(null);
    }, []);

    return { enabled, count, loading, error, enable, disable };
}
