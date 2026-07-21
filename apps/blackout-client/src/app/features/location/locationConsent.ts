import { useCallback, useMemo, useState } from 'react';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { useAtom } from 'jotai';

/**
 * Single source of truth for whether Blackout may use device location.
 *
 * Design goals (privacy WS — "no location without informed, deliberate opt-in"):
 *   1. Default OFF. A fresh install never touches geolocation and never
 *      collects a position until the viewer explicitly turns it on.
 *   2. Never self-enable. Nothing in the app may flip this to `granted`; only
 *      an explicit user action routed through the two-step flow below can.
 *   3. Informed. Before the switch is thrown the viewer is shown, in plain
 *      language, what location is used for, how it affects their anonymity,
 *      and exactly what is retained (see LOCATION_DISCLOSURE).
 *   4. Two steps. Turning it on requires (a) acknowledging the disclosure and
 *      then (b) a separate confirm action — a single stray tap can't do it.
 *
 * Both location consumers — the Home "signals nearby" chip and the coalition
 * map's "Near me" filter — read this atom, so a single revoke turns everything
 * off everywhere.
 */

export type LocationConsentStatus = 'off' | 'granted';

export interface LocationConsentState {
    status: LocationConsentStatus;
    /** Epoch ms of the moment consent was granted; null while off. */
    grantedAt: number | null;
    /** Schema version of the disclosure the viewer acknowledged. */
    disclosureVersion: number | null;
}

/**
 * Bump when the disclosure's material facts change. A viewer who consented to
 * an older disclosure is treated as off until they acknowledge the new one, so
 * we never rely on stale consent.
 */
export const LOCATION_DISCLOSURE_VERSION = 1;

export const DEFAULT_LOCATION_CONSENT: LocationConsentState = {
    status: 'off',
    grantedAt: null,
    disclosureVersion: null,
};

/**
 * Plain-language disclosure shown before location can be enabled. Kept here as
 * data so the consent dialog and the settings page render the identical text —
 * there is exactly one description of what we do and what we keep.
 */
export const LOCATION_DISCLOSURE = {
    version: LOCATION_DISCLOSURE_VERSION,
    title: 'Turn on location services?',
    summary:
        'Blackout keeps location services off until you turn them on here. ' +
        'Location is never collected before you do.',
    /** What enabling location actually powers. */
    uses: [
        'Counting mutual-aid, events, market, and coalition signals near you on Home.',
        'Sorting and filtering the coalition map to activity within a chosen radius.',
    ],
    /** How turning it on affects anonymity — stated bluntly. */
    anonymityEffects: [
        'Sharing any location weakens anonymity: it narrows down roughly where you are.',
        'Your device reveals a precise position to the browser. Before anything leaves this device it is coarsened to a ~1 km grid — enough for a neighbourhood, not an address.',
        'Anything you deliberately post with a location (a mutual-aid pin, a geo-tagged story) is stored on the server and shown to others at the coordinates you choose. That is separate from this setting and always up to you.',
    ],
    /** Exactly what is retained, and where. */
    retention: [
        'On this device: your on/off choice and the time you turned it on, stored in local storage so the app remembers it. Clearing site data or turning it off removes it.',
        'Sent to the server: only a ~1 km-coarse position, used to compute a count. Raw coordinates are never transmitted, and the response contains no locations.',
        'The server does not store your coarse position or build a location history from it.',
    ],
} as const;

const STORAGE_KEY = 'blackout.location.consent.v1';

const safeJsonStorage = createJSONStorage<LocationConsentState>(() => {
    try {
        return globalThis.localStorage;
    } catch {
        // No storage (SSR / blocked): fall back to an in-memory shim so the
        // atom still works but consent simply won't persist.
        const mem = new Map<string, string>();
        return {
            getItem: (k: string) => mem.get(k) ?? null,
            setItem: (k: string, v: string) => void mem.set(k, v),
            removeItem: (k: string) => void mem.delete(k),
        } as Storage;
    }
});

export const locationConsentAtom = atomWithStorage<LocationConsentState>(
    STORAGE_KEY,
    DEFAULT_LOCATION_CONSENT,
    safeJsonStorage,
    { getOnInit: true }
);

/** True only when consent is present AND matches the current disclosure. */
export const isConsentGranted = (state: LocationConsentState): boolean =>
    state.status === 'granted' && state.disclosureVersion === LOCATION_DISCLOSURE_VERSION;

export interface LocationConsent {
    /** Whether location may currently be used. */
    granted: boolean;
    grantedAt: number | null;
    /** Grant consent. Intended to be called only from the two-step flow. */
    grant: () => void;
    /** Revoke consent and turn everything off. */
    revoke: () => void;
}

/** Low-level accessor to the consent atom. Prefer {@link useLocationConsentFlow}. */
export function useLocationConsent(): LocationConsent {
    const [state, setState] = useAtom(locationConsentAtom);

    const grant = useCallback(() => {
        setState({
            status: 'granted',
            grantedAt: Date.now(),
            disclosureVersion: LOCATION_DISCLOSURE_VERSION,
        });
    }, [setState]);

    const revoke = useCallback(() => {
        setState(DEFAULT_LOCATION_CONSENT);
    }, [setState]);

    return { granted: isConsentGranted(state), grantedAt: state.grantedAt, grant, revoke };
}

export interface LocationConsentFlow extends LocationConsent {
    /** True while the disclosure is open awaiting the viewer's decision. */
    disclosureOpen: boolean;
    /** Step 1 — open the disclosure. Does NOT enable anything on its own. */
    requestEnable: () => void;
    /** Step 2 — acknowledge + confirm, granting consent and closing the dialog. */
    confirmEnable: () => void;
    /** Dismiss the disclosure without enabling. */
    cancelEnable: () => void;
}

/**
 * Drives the two-step enable flow plus revoke. `requestEnable` opens the
 * disclosure; `confirmEnable` (wired to the dialog's confirm button, which is
 * itself gated behind an "I understand" acknowledgement) is what actually
 * grants consent. If consent is already granted, `requestEnable` is a no-op.
 */
export function useLocationConsentFlow(): LocationConsentFlow {
    const consent = useLocationConsent();
    const [disclosureOpen, setDisclosureOpen] = useState(false);

    const requestEnable = useCallback(() => {
        if (consent.granted) return;
        setDisclosureOpen(true);
    }, [consent.granted]);

    const confirmEnable = useCallback(() => {
        consent.grant();
        setDisclosureOpen(false);
    }, [consent]);

    const cancelEnable = useCallback(() => setDisclosureOpen(false), []);

    return useMemo(
        () => ({ ...consent, disclosureOpen, requestEnable, confirmEnable, cancelEnable }),
        [consent, disclosureOpen, requestEnable, confirmEnable, cancelEnable]
    );
}

/** ~1.1 km grid: coarse enough to be a neighbourhood, not an address. */
export const coarsenCoordinate = (value: number): number => Math.round(value * 100) / 100;
