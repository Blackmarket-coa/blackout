import { createElement } from 'react';

export const MarketplaceSlice = () =>
    createElement(
        'section',
        { style: { display: 'grid', gap: 10 } },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Drive buyers from catalog browsing to product detail and a single checkout entrypoint.',
        ),
        createElement(
            'ol',
            { style: { margin: 0, paddingInlineStart: 18, display: 'grid', gap: 4 } },
            createElement('li', undefined, 'Catalog filters by category, creator, and price bands'),
            createElement('li', undefined, 'Product page with compatibility and entitlement checks'),
            createElement('li', undefined, 'Checkout entrypoint that preserves selected item context'),
        ),
    );
