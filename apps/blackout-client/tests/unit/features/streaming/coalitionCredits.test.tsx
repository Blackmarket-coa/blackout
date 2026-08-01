// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const mockFetchCoalitionCredits = vi.fn();
vi.mock('../../../../src/app/features/streaming/creditsClient', () => ({
    fetchCoalitionCredits: (...a: unknown[]) => mockFetchCoalitionCredits(...a),
}));

import { CoalitionCreditsSection } from '../../../../src/app/features/streaming/sections/CoalitionCreditsSection';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(CoalitionCreditsSection));
        await flush();
    });
    return container;
};

describe('CoalitionCreditsSection', () => {
    beforeEach(() => mockFetchCoalitionCredits.mockReset());

    it('renders balance, pending payouts, and eligibility chips when available', async () => {
        mockFetchCoalitionCredits.mockResolvedValue({
            available: true,
            balanceMinorUnits: 125_000,
            currency: 'CC',
            pendingPayouts: [
                {
                    currency: 'CC',
                    amountMinorUnits: 5_000,
                    expectedSettlementAt: '2026-09-01T00:00:00.000Z',
                },
            ],
            rewardEligibility: [
                { programKey: 'creator-fund', eligible: true },
                { programKey: 'coalition-boost', eligible: false },
            ],
        });
        const container = await mount();

        const balance = container.querySelector('[data-testid="coalition-credits-balance"]')!;
        // Minor units → major, suffixed with the API's currency code (no symbol).
        expect(balance.textContent).toContain('1,250.00');
        expect(balance.textContent).toContain('CC');

        expect(
            container.querySelectorAll('[data-testid="coalition-credits-payout-row"]').length
        ).toBe(1);
        expect(
            container.querySelectorAll('[data-testid="coalition-credits-eligibility-chip"]').length
        ).toBe(2);
        expect(container.textContent).toContain('creator-fund');
        expect(container.textContent).toContain('Eligible');
        // The unavailable placeholder must not be present in the available state.
        expect(container.querySelector('[data-testid="coalition-credits-unavailable"]')).toBeNull();
    });

    it('shows an empty payouts state without inventing a balance section for zero payouts', async () => {
        mockFetchCoalitionCredits.mockResolvedValue({
            available: true,
            balanceMinorUnits: 0,
            currency: 'CC',
            pendingPayouts: [],
            rewardEligibility: [],
        });
        const container = await mount();
        expect(
            container.querySelector('[data-testid="coalition-credits-payouts-empty"]')
        ).not.toBeNull();
        // Balance still renders (0.00) — only the "not configured" path hides it.
        expect(
            container.querySelector('[data-testid="coalition-credits-balance"]')!.textContent
        ).toContain('0.00');
    });

    it('hides the panel behind a subtle notice when the service is unavailable', async () => {
        mockFetchCoalitionCredits.mockResolvedValue({ available: false });
        const container = await mount();
        expect(
            container.querySelector('[data-testid="coalition-credits-unavailable"]')
        ).not.toBeNull();
        // No zeroed balance is shown in the not-configured state.
        expect(container.querySelector('[data-testid="coalition-credits-balance"]')).toBeNull();
    });

    it('degrades to the unavailable notice when the client call rejects', async () => {
        // Use a lazy per-call rejection rather than `mockRejectedValue`: under
        // vitest 4 the latter eagerly constructs a rejected promise at set-time
        // that the runner flags as an unhandled rejection even once the
        // component has caught it.
        mockFetchCoalitionCredits.mockImplementationOnce(() =>
            Promise.reject(new Error('network'))
        );
        const container = await mount();
        expect(
            container.querySelector('[data-testid="coalition-credits-unavailable"]')
        ).not.toBeNull();
    });
});
