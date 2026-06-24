import { useEffect, useState, type ReactNode } from 'react';
import type { PlaybookAccentToken } from '@blackout/protocol';
import { PLAYBOOK_ACCENT_TOKENS } from '../../styles/playbookTokens';

/**
 * Generic "community thermometer" — an aggregate progress bar shared by every
 * cooperative collective-goal surface (den objectives, treasury milestones,
 * governance quorums).
 *
 * It is deliberately presentational and *aggregate-only*: it renders a filled
 * bar plus a left/right label, and knows nothing about individuals. This is the
 * System-5 banlist made concrete — there is no slot for a per-member ranking.
 * The fill eases ("grows like sap") unless `prefers-reduced-motion` is set.
 */
export interface ThermometerProps {
    /** Completion percentage; clamped to 0–100. */
    percent: number;
    /** Left-aligned summary, e.g. "25/40 hours" or "12,345 / 50,000 USDC". */
    primaryLabel: ReactNode;
    /** Right-aligned secondary, e.g. "3 contributing" or "Δ +12.50". */
    secondaryLabel?: ReactNode;
    accent?: PlaybookAccentToken;
    met?: boolean;
    /** Accessible label for the bar; falls back to the primary summary. */
    ariaLabel?: string;
    ariaValueNow?: number;
    ariaValueMax?: number;
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

export function Thermometer({
    percent,
    primaryLabel,
    secondaryLabel,
    accent,
    met,
    ariaLabel,
    ariaValueNow,
    ariaValueMax,
}: ThermometerProps) {
    const reducedMotion = usePrefersReducedMotion();
    const fill = accent ? PLAYBOOK_ACCENT_TOKENS[accent].solid : 'var(--accent-primary)';
    const clamped = Math.min(100, Math.max(0, percent));

    return (
        <div style={{ display: 'grid', gap: 4 }}>
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={ariaValueMax ?? 100}
                aria-valuenow={ariaValueNow ?? clamped}
                aria-label={ariaLabel}
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
                    {primaryLabel}
                    {met ? ' · met 🌿' : ''}
                </span>
                {secondaryLabel !== undefined ? <span>{secondaryLabel}</span> : null}
            </div>
        </div>
    );
}

export default Thermometer;
