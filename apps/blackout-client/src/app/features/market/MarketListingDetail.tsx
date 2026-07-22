import { lazy, Suspense, type CSSProperties } from 'react';

// Same lazy split as MarketShell: the listing slice transitively pulls the
// heavy commerce + matrix-js-sdk auth paths, so keep feature-registry
// composition jsdom-independent by deferring the import to render time.
const ListingDetailSliceLazy = lazy(() =>
    import('../monetization/marketplace/ListingDetailSlice').then((mod) => ({
        default: mod.ListingDetailSlice,
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

const bodyStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    padding: '16px 20px 24px',
    overflow: 'auto',
};

/** AppShell-mounted listing detail at `/market/listings/:providerId/:listingId`. */
export const MarketListingDetail = (): JSX.Element => (
    <section style={layoutStyle} data-shell-region="market">
        <div style={bodyStyle} data-testid="market-listing-detail-body">
            <Suspense fallback={null}>
                <ListingDetailSliceLazy />
            </Suspense>
        </div>
    </section>
);

export default MarketListingDetail;
