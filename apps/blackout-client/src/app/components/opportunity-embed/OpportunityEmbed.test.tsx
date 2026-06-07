// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { OpportunityEmbed } from './OpportunityEmbed';
import { buildOpportunityEvent, parseOpportunityEvent } from './opportunityEmbedSchema';

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
    });
    return container;
};

describe('opportunityEmbedSchema', () => {
    it('drops malformed entries and keeps valid ones', () => {
        const parsed = parseOpportunityEvent({
            version: 1,
            opportunities: [
                { kind: 'market_demand', title: 'Compost demand spike', metric: '+38%' },
                { kind: 'bogus', title: 'Invalid kind' },
                { title: 'No kind' },
                'not-an-object',
            ],
        });
        expect(parsed.opportunities).toHaveLength(1);
        expect(parsed.opportunities[0]?.kind).toBe('market_demand');
    });

    it('returns empty on non-object content', () => {
        expect(parseOpportunityEvent(null).opportunities).toHaveLength(0);
        expect(parseOpportunityEvent('x').opportunities).toHaveLength(0);
    });

    it('builder caps at 8 opportunities', () => {
        const refs = Array.from({ length: 12 }, (_, i) => ({
            kind: 'launch' as const,
            title: `Launch ${i}`,
        }));
        expect(buildOpportunityEvent(refs).opportunities).toHaveLength(8);
    });
});

describe('OpportunityEmbed', () => {
    it('renders a card per opportunity', async () => {
        const container = await render(
            React.createElement(OpportunityEmbed, {
                content: {
                    version: 1,
                    opportunities: [
                        { kind: 'product_opportunity', title: 'Mushroom kits' },
                        { kind: 'launch', title: 'Seed co-op', url: 'https://fbm.example/x' },
                    ],
                },
            }),
        );
        const cards = container.querySelectorAll('[data-testid="opportunity-card"]');
        expect(cards.length).toBe(2);
        expect(cards[1]?.getAttribute('data-opportunity-kind')).toBe('launch');
    });

    it('renders nothing for empty content', async () => {
        const container = await render(React.createElement(OpportunityEmbed, { content: {} }));
        expect(container.querySelector('[data-testid="opportunity-embed"]')).toBeNull();
    });
});
