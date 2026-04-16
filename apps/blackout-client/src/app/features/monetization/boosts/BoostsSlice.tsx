import { createElement } from 'react';

export const BoostsSlice = () =>
    createElement(
        'section',
        { style: { display: 'grid', gap: 10 } },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Track active boosts, unlocked tiers, and perk health from a single dashboard view.',
        ),
        createElement(
            'div',
            {
                style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 8,
                },
            },
            ...[
                ['Current tier', 'Tier 2 Coalition'],
                ['Boost count', '18 / 25 to Tier 3'],
                ['Perk uptime', '99.4% this month'],
            ].map(([label, value]) =>
                createElement(
                    'div',
                    {
                        key: label,
                        style: {
                            border: '1px solid var(--border-default)',
                            borderRadius: 10,
                            background: 'var(--bg-input)',
                            padding: 10,
                            display: 'grid',
                            gap: 4,
                        },
                    },
                    createElement('small', { style: { color: 'var(--text-secondary)' } }, label),
                    createElement('strong', undefined, value),
                ),
            ),
        ),
    );
