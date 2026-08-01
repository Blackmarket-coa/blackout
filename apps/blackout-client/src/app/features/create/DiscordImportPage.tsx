import { lazy, Suspense, type CSSProperties } from 'react';

// The wizard body pulls in matrix-js-sdk paths (create-room utils, den
// helpers). Keep it lazy so feature-registry composition stays
// jsdom-independent — same pattern MarketShell uses for MarketplaceSlice.
const DiscordImportWizardLazy = lazy(() =>
    import('./DiscordImportWizard').then((mod) => ({ default: mod.DiscordImportWizard }))
);

const fallbackStyle: CSSProperties = {
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
};

/** Route body for `/create/import` — thin Suspense shell around the wizard. */
export const DiscordImportPage = (): JSX.Element => (
    <Suspense fallback={<div style={fallbackStyle} />}>
        <DiscordImportWizardLazy />
    </Suspense>
);

export default DiscordImportPage;
