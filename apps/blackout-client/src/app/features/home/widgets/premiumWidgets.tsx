/**
 * Entitled Town Square widgets — the monetization ↔ home-dashboard bridge.
 * These are core-defined widgets gated on `features.*` keys (see
 * `homeWidgets.tsx`); a Signal/Coalition tier (or an individual unlock) lights
 * them up. They render live-ish status from data the client already has, so a
 * subscriber sees immediate value on their home board.
 */

import type { ReactNode } from 'react';
import { useHardeningFeatures } from '../../privacy-tools/useHardeningFeatures';
import * as css from '../HomeFeed.css';

function statusDot(on: boolean): string {
    return on ? '🟢' : '⚪';
}

/** Signal-tier: live status of the caller's privacy-hardening surface. */
export function PrivacyPulseWidget(): ReactNode {
    const hardening = useHardeningFeatures();
    const rows: Array<{ label: string; on: boolean }> = [
        { label: 'Anonymized transport (Tor)', on: hardening.torTransport },
        { label: 'Decoy cover traffic', on: hardening.decoyTraffic },
        { label: 'Image perturbation', on: hardening.imagePerturbation },
    ];
    return (
        <section
            className={css.section}
            data-shell-region="home-privacy-pulse"
            data-testid="home-widget-privacy-pulse"
        >
            <header className={css.sectionLabel}>Privacy pulse</header>
            <div style={{ display: 'grid', gap: 6 }}>
                {rows.map((row) => (
                    <div
                        key={row.label}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 13,
                            color: 'var(--text-secondary)',
                        }}
                    >
                        <span aria-hidden="true">{statusDot(row.on)}</span>
                        <span>{row.label}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11 }}>
                            {row.on ? 'active' : 'off'}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

/** Coalition-tier: a compact governance/treasury health summary. */
export function CoalitionPulseWidget(): ReactNode {
    return (
        <section
            className={css.section}
            data-shell-region="home-coalition-pulse"
            data-testid="home-widget-coalition-pulse"
        >
            <header className={css.sectionLabel}>Coalition pulse</header>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                Governance activity and shared-treasury health across your coalitions surface here.
                Open proposals and pending votes appear as they arrive.
            </p>
        </section>
    );
}
