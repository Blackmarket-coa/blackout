// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchCreatorDrivenSales = vi.fn();
vi.mock('../../../../src/app/features/growth/growthClient', () => ({
    fetchCreatorDrivenSales: (...a: unknown[]) => fetchCreatorDrivenSales(...a),
}));

// Local mirror of the summary shape so the test never imports from the mocked
// module (importing a type from a vi.mock'd module can pull the real module in
// alongside the mock and trip an unhandled rejection on the failure path).
interface Bucket {
    count: number;
    gmvCents: number;
    feeCents: number;
    netCents: number;
}
interface SummaryShape {
    beneficiaryUserId: string;
    total: Bucket;
    byKind: {
        referral_bonus: Bucket;
        ambassador_commission: Bucket;
        quest_reward: Bucket;
        bounty_reward: Bucket;
    };
    sinceIso: string | null;
    generatedAt: string;
}

import { CreatorHubCreatorDrivenSales } from '../../../../src/app/features/streaming/sections/CreatorHubCreatorDrivenSales';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(CreatorHubCreatorDrivenSales));
        await flush();
    });
    return container;
};

const zero = (): Bucket => ({ count: 0, gmvCents: 0, feeCents: 0, netCents: 0 });

const summary = (over: Partial<SummaryShape> = {}): SummaryShape => ({
    beneficiaryUserId: '@me:bmc',
    total: zero(),
    byKind: {
        referral_bonus: zero(),
        ambassador_commission: zero(),
        quest_reward: zero(),
        bounty_reward: zero(),
    },
    sinceIso: null,
    generatedAt: '2026-06-04T00:00:00.000Z',
    ...over,
});

describe('CreatorHubCreatorDrivenSales', () => {
    beforeEach(() => fetchCreatorDrivenSales.mockReset());

    it('renders total KPI and only the attribution kinds with sales', async () => {
        fetchCreatorDrivenSales.mockResolvedValue(
            summary({
                total: { count: 2, gmvCents: 1500, feeCents: 45, netCents: 1455 },
                byKind: {
                    referral_bonus: { count: 1, gmvCents: 500, feeCents: 15, netCents: 485 },
                    ambassador_commission: zero(),
                    quest_reward: zero(),
                    bounty_reward: { count: 1, gmvCents: 1000, feeCents: 30, netCents: 970 },
                },
            }),
        );
        const container = await mount();
        expect(container.querySelector('[data-testid="cds-count"]')!.textContent).toBe('2');
        expect(container.querySelector('[data-testid="cds-gmv"]')!.textContent).toBe('$15.00');
        expect(container.querySelector('[data-testid="cds-net"]')!.textContent).toBe('$14.55');
        // Two kinds have sales (referral + bounty); the two zero kinds are hidden.
        expect(container.querySelectorAll('[data-testid="cds-kind-row"]').length).toBe(2);
        expect(container.textContent).toContain('Referrals');
        expect(container.textContent).toContain('Bounties');
        expect(container.textContent).not.toContain('Ambassador');
    });

    it('renders the empty state with zeroed totals when there are no sales', async () => {
        fetchCreatorDrivenSales.mockResolvedValue(summary());
        const container = await mount();
        expect(container.querySelector('[data-testid="cds-empty"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="cds-count"]')!.textContent).toBe('0');
        expect(container.querySelector('[data-testid="cds-gmv"]')!.textContent).toBe('$0.00');
        expect(container.querySelectorAll('[data-testid="cds-kind-row"]').length).toBe(0);
    });
});
