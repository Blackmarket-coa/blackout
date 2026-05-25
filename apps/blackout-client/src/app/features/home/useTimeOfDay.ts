import { useEffect, useState } from 'react';

/**
 * Local-clock driven "atmosphere" for the home page. Solarpunk surfaces shift
 * warmth across the day — peach at dawn, bright at midday, amber at dusk, cool
 * at night — which deepens the sense that the ecosystem is a real place living
 * through real time. No network/geolocation: just the device clock.
 */
export type TimeOfDayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface TimeOfDayAtmosphere {
    phase: TimeOfDayPhase;
    label: string;
    /** Tint wash layered over the ambient backdrop. */
    tint: string;
    /** Warm/cool glow used by breathing gradients + node pulses. */
    glow: string;
}

export const phaseForHour = (hour: number): TimeOfDayPhase => {
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
};

const ATMOSPHERE: Record<TimeOfDayPhase, Omit<TimeOfDayAtmosphere, 'phase'>> = {
    dawn: {
        label: 'Dawn',
        tint: 'radial-gradient(120% 80% at 15% -10%, rgba(255,183,71,0.20), transparent 60%)',
        glow: 'rgba(255,183,71,0.55)',
    },
    day: {
        label: 'Midday',
        tint: 'radial-gradient(120% 80% at 80% -10%, rgba(46,242,197,0.16), transparent 60%)',
        glow: 'rgba(46,242,197,0.50)',
    },
    dusk: {
        label: 'Dusk',
        tint: 'radial-gradient(120% 80% at 20% -10%, rgba(198,106,43,0.24), transparent 62%)',
        glow: 'rgba(198,106,43,0.60)',
    },
    night: {
        label: 'Night',
        tint: 'radial-gradient(120% 90% at 50% -20%, rgba(42,107,63,0.26), transparent 65%)',
        glow: 'rgba(46,90,66,0.55)',
    },
};

export const atmosphereForDate = (date: Date): TimeOfDayAtmosphere => {
    const phase = phaseForHour(date.getHours());
    return { phase, ...ATMOSPHERE[phase] };
};

/** Re-evaluates every 5 minutes so the page drifts through the day in place. */
export const useTimeOfDay = (): TimeOfDayAtmosphere => {
    const [atmosphere, setAtmosphere] = useState<TimeOfDayAtmosphere>(() =>
        atmosphereForDate(new Date())
    );
    useEffect(() => {
        const tick = () => setAtmosphere(atmosphereForDate(new Date()));
        const id = window.setInterval(tick, 5 * 60 * 1000);
        return () => window.clearInterval(id);
    }, []);
    return atmosphere;
};
