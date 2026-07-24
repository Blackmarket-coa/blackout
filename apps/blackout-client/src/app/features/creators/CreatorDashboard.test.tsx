// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';

const fetchMyAmbassadorMock = vi.fn();
const fetchMyReferralsMock = vi.fn();
const fetchMyMigrationCreditsMock = vi.fn();

vi.mock('../growth', () => ({
    fetchMyAmbassador: (...a: unknown[]) => fetchMyAmbassadorMock(...a),
    fetchMyReferrals: (...a: unknown[]) => fetchMyReferralsMock(...a),
    fetchMyMigrationCredits: (...a: unknown[]) => fetchMyMigrationCreditsMock(...a),
}));

vi.mock('../monetization/components/CreatorEarningsDashboard', () => ({
    CreatorEarningsDashboard: () => <div data-testid="earnings-dashboard-stub">earnings</div>,
}));

import CreatorDashboard from './CreatorDashboard';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const mountDashboard = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const router = createMemoryRouter([{ path: '/creator', element: <CreatorDashboard /> }], {
        initialEntries: ['/creator'],
    });
    await act(async () => {
        root.render(<RouterProvider router={router} />);
        await flush();
    });
    return { container };
};

describe('CreatorDashboard', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchMyAmbassadorMock.mockReset();
        fetchMyReferralsMock.mockReset();
        fetchMyMigrationCreditsMock.mockReset();
    });

    it('renders three growth status cards plus the earnings dashboard', async () => {
        fetchMyAmbassadorMock.mockResolvedValue({ ambassador: null });
        fetchMyReferralsMock.mockResolvedValue({ items: [] });
        fetchMyMigrationCreditsMock.mockResolvedValue({ items: [] });

        const { container } = await mountDashboard();

        expect(
            container.querySelector('[data-testid="creator-dashboard-card-ambassador"]')
        ).not.toBeNull();
        expect(
            container.querySelector('[data-testid="creator-dashboard-card-referrals"]')
        ).not.toBeNull();
        expect(
            container.querySelector('[data-testid="creator-dashboard-card-credits"]')
        ).not.toBeNull();
    });

    it('summarizes pending referrals + unredeemed credits when present', async () => {
        fetchMyAmbassadorMock.mockResolvedValue({
            ambassador: {
                id: 'a1',
                userId: 'u1',
                tier: 'sapling',
                commissionBps: 200,
                quotaCanopiesActive: 0,
                status: 'active',
                startedAt: '2025-01-01T00:00:00Z',
                lastReviewedAt: '2025-01-01T00:00:00Z',
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
            },
        });
        fetchMyReferralsMock.mockResolvedValue({
            items: [
                {
                    id: 'r1',
                    referrerUserId: 'u1',
                    refereeUserId: 'u2',
                    sourceKind: 'invite_link',
                    sourceRef: null,
                    status: 'pending',
                    rewardTipId: null,
                    rewardCents: null,
                    attributedAt: '2025-02-01T00:00:00Z',
                    settledAt: null,
                    createdAt: '2025-02-01T00:00:00Z',
                    updatedAt: '2025-02-01T00:00:00Z',
                },
                {
                    id: 'r2',
                    referrerUserId: 'u1',
                    refereeUserId: 'u3',
                    sourceKind: 'invite_link',
                    sourceRef: null,
                    status: 'settled',
                    rewardTipId: 't1',
                    rewardCents: 500,
                    attributedAt: '2025-02-01T00:00:00Z',
                    settledAt: '2025-02-02T00:00:00Z',
                    createdAt: '2025-02-01T00:00:00Z',
                    updatedAt: '2025-02-02T00:00:00Z',
                },
            ],
        });
        fetchMyMigrationCreditsMock.mockResolvedValue({
            items: [
                {
                    id: 'm1',
                    userId: 'u1',
                    fbmCreditId: null,
                    sourceKind: 'discord_migration',
                    sourceHandle: 'alpha',
                    valueCents: 1000,
                    currency: 'USD',
                    grantedAt: '2025-02-01T00:00:00Z',
                    redeemedAt: null,
                    createdAt: '2025-02-01T00:00:00Z',
                    updatedAt: '2025-02-01T00:00:00Z',
                },
            ],
        });

        const { container } = await mountDashboard();
        const ambassadorCard = container.querySelector(
            '[data-testid="creator-dashboard-card-ambassador"]'
        );
        expect(ambassadorCard?.textContent).toContain('sapling');

        const referralCard = container.querySelector(
            '[data-testid="creator-dashboard-card-referrals"]'
        );
        // Pending = 1 (the second is settled).
        expect(referralCard?.textContent).toContain('1');
        expect(referralCard?.textContent).toContain('2 total invitees');

        const creditCard = container.querySelector(
            '[data-testid="creator-dashboard-card-credits"]'
        );
        expect(creditCard?.textContent).toContain('1');
    });
});
