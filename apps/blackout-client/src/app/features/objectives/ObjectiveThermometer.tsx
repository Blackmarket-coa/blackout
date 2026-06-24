import { useEffect, useState } from 'react';
import type { PlaybookAccentToken } from '@blackout/protocol';
import { PLAYBOOK_ACCENT_TOKENS } from '../../styles/playbookTokens';

/**
 * Aggregate progress "thermometer" for a shared den objective.
 *
 * Renders ONLY collective progress: a filled bar, `{current}/{target} {unit}`,
 * and a distinct-contributor *count*. There is deliberately no per-member
 * breakdown, ranking, or attribution here — that is the System-5 banlist
 * constraint. The fill "grows like sap" with a calm easing that is disabled
 * under `prefers-reduced-motion`.
 */
export interface ObjectiveThermometerProps {
    percent: number;
    current: number;
    target: number;
    unit: string;
    contributorCount: number;
    accent?: PlaybookAccentToken;
    met?: boolean;
}

const usePrefersReducedMotion = (): boolean => {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined;
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(query.matches);
        const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
        query.addEventListener?.('change', onChange);
        return () => query.removeEventListener?.('change', onChange);
    }, []);
    return reduced;
};

export function ObjectiveThermometer({
    percent,
    current,
    target,
    unit,
    contributorCount,
    accent,
    met,
}: ObjectiveThermometerProps) {
    const reducedMotion = usePrefersReducedMotion();
    const fill = accent ? PLAYBOOK_ACCENT_TOKENS[accent].solid : 'var(--accent-primary)';
    const clamped = Math.min(100, Math.max(0, percent));

    return (
        <div style={{ display: 'grid', gap: 4 }}>
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={current}
                aria-label={`${current} of ${target} ${unit}`}
                style={{
                    height: 10,
                    borderRadius: 999,
                    background: 'var(--bg-input)',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: `${clamped}%`,
                        height: '100%',
                        background: fill,
                        transition: reducedMotion ? undefined : 'width 600ms ease',
                    }}
                />
            </div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                }}
            >
                <span>
                    {current}/{target} {unit}
                    {met ? ' · met 🌿' : ''}
                </span>
                <span>
                    {contributorCount} contributing
                </span>
            </div>
        </div>
    );
}

export default ObjectiveThermometer;
