import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { accessibilitySettingsAtom } from '../settings/settingsAtoms';

/**
 * True when ambient motion (breathing gradients, connection-line canvas, node
 * pulses) must be suppressed. Honours both the user's in-app accessibility
 * preference and the OS `prefers-reduced-motion` media query. `matchMedia` is
 * guarded so the hook is safe under jsdom/SSR.
 */
export const useReducedMotion = (): boolean => {
    const settingPref = useAtomValue(accessibilitySettingsAtom).reducedMotion;
    const [osPref, setOsPref] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        setOsPref(query.matches);
        const onChange = (event: MediaQueryListEvent) => setOsPref(event.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);

    return settingPref || osPref;
};
