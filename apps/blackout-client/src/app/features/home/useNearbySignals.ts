import { useCallback, useEffect, useState } from 'react';
import { fetchNearbySignals } from '../coalition/coalitionClient';
import { coarsenCoordinate, useLocationConsentFlow } from '../location/locationConsent';

/**
 * Opt-in "signals nearby" state for the Home chip (OSS gap-fill WS4).
 *
 * Privacy model: nothing happens until the viewer completes the shared,
 * two-step location opt-in (see `location/locationConsent`). Location is off by
 * default and can never be turned on without the viewer doing so. Once consent
 * is granted we ask the browser for a position ONCE per load, coarsen it to a
 * ~1.1 km cell before it leaves the device, ask the coalition API how many
 * located signals sit within NEARBY_RADIUS_KM, and keep only the count. Raw
 * coordinates are never stored or transmitted, and the server response carries
 * no locations either.
 */

export const NEARBY_RADIUS_KM = 10;

/** ~1.1 km grid: coarse enough to be a neighbourhood, not an address. */
export const coarsen = coarsenCoordinate;

export interface NearbySignalsState {
    /** Whether location consent is granted (the chip is "on"). */
    enabled: boolean;
    /** Count of nearby signals; null until a fetch has succeeded. */
    count: number | null;
    loading: boolean;
    error: string | null;
    /** True while the two-step location disclosure is open. */
    disclosureOpen: boolean;
    /** Step 1 — open the disclosure. Never enables on its own. */
    requestEnable: () => void;
    /** Step 2 — acknowledge + confirm; grants consent. */
    confirmEnable: () => void;
    /** Dismiss the disclosure without enabling. */
    cancelEnable: () => void;
    /** Turn location back off (revokes the shared consent). */
    disable: () => void;
}

export function useNearbySignals(): NearbySignalsState {
    const consent = useLocationConsentFlow();
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

    // Fetch only once consent is granted; never touch geolocation otherwise.
    useEffect(() => {
        if (consent.granted) refresh();
    }, [consent.granted, refresh]);

    const disable = useCallback(() => {
        consent.revoke();
        setCount(null);
        setError(null);
        setLoading(false);
    }, [consent]);

    return {
        enabled: consent.granted,
        count,
        loading,
        error,
        disclosureOpen: consent.disclosureOpen,
        requestEnable: consent.requestEnable,
        confirmEnable: consent.confirmEnable,
        cancelEnable: consent.cancelEnable,
        disable,
    };
}
