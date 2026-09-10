/**
 * Entitled Town Square widgets — the monetization ↔ home-dashboard bridge.
 * These are core-defined widgets gated on `features.*` keys (see
 * `homeWidgets.tsx`); a Signal/Coalition tier (or an individual unlock) lights
 * them up. They render live-ish status from data the client already has, so a
 * subscriber sees immediate value on their home board.
 */

import type { ReactNode } from 'react';
import {
    HARDENING_CAPABILITY_IMPLEMENTED,
    useHardeningFeatures,
    type HardeningCapability,
} from '../../privacy-tools/useHardeningFeatures';
import * as css from '../HomeFeed.css';

type PulseState = 'active' | 'off' | 'planned';

/**
 * An entitlement says the plan grants a capability; it does not say the
 * capability exists. Tor transport and decoy traffic are entitled and unbuilt,
 * so an entitled-but-unimplemented row reads "planned" and never "active" —
 * anonymized transport is a claim a member may act on. See
 * HARDENING_CAPABILITY_IMPLEMENTED and TRANSMUTATION_NOTES.md §4.
 */
export function pulseState(entitled: boolean, capability: HardeningCapability): PulseState {
    if (!HARDENING_CAPABILITY_IMPLEMENTED[capability]) {
        return 'planned';
    }
    return entitled ? 'active' : 'off';
}

function statusDot(state: PulseState): string {
    if (state === 'active') {
        return '🟢';
    }
    return state === 'planned' ? '🔵' : '⚪';
}

/** Signal-tier: live status of the caller's privacy-hardening surface. */
export function PrivacyPulseWidget(): ReactNode {
    const hardening = useHardeningFeatures();
    const rows: Array<{ label: string; state: PulseState }> = [
        {
            label: 'Anonymized transport (Tor)',
            state: pulseState(hardening.torTransport, 'torTransport'),
        },
        { label: 'Decoy cover traffic', state: pulseState(hardening.decoyTraffic, 'decoyTraffic') },
        {
            label: 'Image perturbation',
            state: pulseState(hardening.imagePerturbation, 'imagePerturbation'),
        },
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
                        <span aria-hidden="true">{statusDot(row.state)}</span>
                        <span>{row.label}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11 }}>
                            {row.state}
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
