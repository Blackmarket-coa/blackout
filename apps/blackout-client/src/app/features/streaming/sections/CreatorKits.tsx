import React, { type CSSProperties, useState } from 'react';
import { Link } from 'react-router-dom';
import { CREATOR_KITS, type CreatorKit } from '../kits/kitCatalog';
import { HubSection, hubCardStyle, hubGridStyle } from '../components/HubSection';

const kitCardStyle = (active: boolean): CSSProperties => ({
    ...hubCardStyle,
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    borderColor: active ? 'var(--accent-primary, #2EF2C5)' : 'var(--border-default, #374151)',
});

const glyphStyle: CSSProperties = { fontSize: 28, lineHeight: 1 };
const kitNameStyle: CSSProperties = { fontSize: 15, fontWeight: 700 };
const kitTaglineStyle: CSSProperties = { fontSize: 12, color: 'var(--text-muted, #9ca3af)' };

const detailStyle: CSSProperties = {
    marginTop: 16,
    padding: 16,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 14,
    background: 'var(--bg-input, #0f172a)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
};

const groupTitleStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
    margin: '0 0 4px',
};

const listStyle: CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 };

const linkRowStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };

const linkStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #2EF2C5)',
    color: 'var(--accent-primary, #2EF2C5)',
    background: 'transparent',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
};

const ConfigGroup = ({ title, items }: { title: string; items: string[] }): JSX.Element => (
    <div>
        <p style={groupTitleStyle}>{title}</p>
        <ul style={listStyle}>
            {items.map((item) => (
                <li key={item}>{item}</li>
            ))}
        </ul>
    </div>
);

const KitDetail = ({ kit }: { kit: CreatorKit }): JSX.Element => (
    <div style={detailStyle} data-testid="creator-kit-detail" data-kit-id={kit.id}>
        <strong style={{ fontSize: 16 }}>
            {kit.glyph} {kit.name}
        </strong>
        <div style={hubGridStyle}>
            <ConfigGroup title="Profile" items={kit.configures.profile} />
            <ConfigGroup title="Dens" items={kit.configures.dens} />
            <ConfigGroup title="Monetization" items={kit.configures.monetization} />
            <ConfigGroup title="Stream tools" items={kit.configures.streamTools} />
        </div>
        <div style={linkRowStyle}>
            {kit.deepLinks.map((link) => (
                <Link
                    key={link.to + link.label}
                    to={link.to}
                    style={linkStyle}
                    data-testid="creator-kit-deeplink"
                >
                    {link.label} ↗
                </Link>
            ))}
        </div>
    </div>
);

/**
 * Creator Kits catalog. Selecting a kit reveals what it configures plus
 * deep-links into the underlying surfaces (profile, events, monetization,
 * listings) so a creator can set it up. One-click apply is intentionally
 * deferred — see kitCatalog.ts.
 */
export const CreatorKits = (): JSX.Element => {
    const [selectedKitId, setSelectedKitId] = useState<string | null>(CREATOR_KITS[0]?.id ?? null);
    const selectedKit = CREATOR_KITS.find((kit) => kit.id === selectedKitId) ?? null;

    return (
        <HubSection
            title="Creator Kits"
            subtitle="Install-ready presets that configure your profile, dens, monetization, and stream tools for a workflow."
            testId="creator-kits"
            shellRegion="creator-kits"
        >
            <div style={hubGridStyle} data-testid="creator-kits-grid">
                {CREATOR_KITS.map((kit) => (
                    <button
                        key={kit.id}
                        type="button"
                        style={kitCardStyle(kit.id === selectedKitId)}
                        onClick={() => setSelectedKitId(kit.id)}
                        data-testid="creator-kit-card"
                        data-kit-id={kit.id}
                        aria-pressed={kit.id === selectedKitId}
                    >
                        <span style={glyphStyle} aria-hidden="true">
                            {kit.glyph}
                        </span>
                        <span style={kitNameStyle}>{kit.name}</span>
                        <span style={kitTaglineStyle}>{kit.tagline}</span>
                    </button>
                ))}
            </div>
            {selectedKit ? <KitDetail kit={selectedKit} /> : null}
        </HubSection>
    );
};

export default CreatorKits;
