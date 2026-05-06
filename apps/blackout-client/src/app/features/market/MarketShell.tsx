import { lazy, Suspense, type CSSProperties } from 'react';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

// MarketplaceSlice is part of the legacy monetization feature and
// transitively pulls in heavy commerce + matrix-js-sdk paths via its
// auth helper. Keep it lazy so feature-registry composition stays
// jsdom-independent — same pattern PR 1/PR 2 used for ClientLayout
// and HomeFeed.
const MarketplaceSliceLazy = lazy(() =>
    import('../monetization/marketplace/MarketplaceSlice').then((mod) => ({
        default: mod.MarketplaceSlice,
    }))
);

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '16px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const subtitleStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const bodyStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    padding: '8px 16px 24px',
    overflow: 'auto',
};

/**
 * AppShell-mounted Market destination at `/market`. PR 3 hoists the
 * existing `MarketplaceSlice` (the wired buyer surface from
 * `features/monetization/marketplace`) into the canonical destination
 * model — no duplicated buyer UI, no parallel fetcher. The shell adds
 * a mode-aware top header so the surface looks at home alongside
 * HomeFeed and CommunitiesView.
 *
 * Empty / disabled state: when `monetizationMarketplace` flag is off
 * the underlying slice still renders ("No listings match these
 * filters") because there are no providers — acceptable for the v1
 * rollout. Subsequent PRs gate the bottom-tab on the underlying flag
 * to hide the entry entirely when commerce isn't wired.
 */
export const MarketShell = (): JSX.Element => (
    <section style={layoutStyle} data-shell-region="market">
        <header style={headerStyle}>
            <h1 style={titleStyle}>Market</h1>
            <p style={subtitleStyle}>
                Browse listings published by {BLACKOUT_TERMS.canopy.plural} and creators.
            </p>
        </header>
        <div style={bodyStyle} data-testid="market-shell-body">
            <Suspense fallback={null}>
                <MarketplaceSliceLazy />
            </Suspense>
        </div>
    </section>
);

export default MarketShell;
