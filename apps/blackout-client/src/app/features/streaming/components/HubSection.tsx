import React, { type CSSProperties, type ReactNode } from 'react';

/**
 * Shared layout primitive for the Creator Hub sections (Overview, Clips,
 * Kits, Rewards). Centralizes the expressive solarpunk treatment — a
 * neon-leaf → solar-mint accent rule under the section title — so every
 * hub surface reads consistently. Pure presentational; data lives in the
 * calling section.
 */

// Solarpunk accents from styles/theme-engine.ts (neonLeaf / solarMint),
// applied via gradients with CSS-var fallbacks so theme packs still win
// for the base surfaces.
const NEON_LEAF = '#D7FF3F';
const SOLAR_MINT = '#2EF2C5';

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '20px 20px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const titleStyle: CSSProperties = {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: -0.2,
};

const accentRuleStyle: CSSProperties = {
    height: 3,
    width: 56,
    borderRadius: 999,
    background: `linear-gradient(90deg, ${NEON_LEAF}, ${SOLAR_MINT})`,
};

const subtitleStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
    maxWidth: 720,
};

const bodyStyle: CSSProperties = {
    padding: '8px 16px 28px',
};

export interface HubSectionProps {
    title: string;
    subtitle?: string;
    /** Optional controls rendered on the title row (filters, actions). */
    actions?: ReactNode;
    children: ReactNode;
    /** Forwarded to the root `<section>` for tests / shell-region targeting. */
    testId?: string;
    shellRegion?: string;
}

const titleRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
};

export function HubSection({
    title,
    subtitle,
    actions,
    children,
    testId,
    shellRegion,
}: HubSectionProps): JSX.Element {
    return (
        <section style={sectionStyle} data-testid={testId} data-shell-region={shellRegion}>
            <header style={headerStyle}>
                <div style={titleRowStyle}>
                    <h1 style={titleStyle}>{title}</h1>
                    {actions ? <div>{actions}</div> : null}
                </div>
                <span style={accentRuleStyle} aria-hidden="true" />
                {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
            </header>
            <div style={bodyStyle}>{children}</div>
        </section>
    );
}

/** Responsive card grid used across the hub sections. */
export const hubGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 12,
};

export const hubCardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 16,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 14,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    textDecoration: 'none',
};

export const hubCardLabelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
};

export const hubCardTitleStyle: CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
};

export const hubCardMetaStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
};

export const hubEmptyStyle: CSSProperties = {
    margin: '8px 0',
    padding: '24px 20px',
    border: '1px dashed var(--border-default, #374151)',
    borderRadius: 14,
    color: 'var(--text-muted, #9ca3af)',
    textAlign: 'center',
};

export default HubSection;
