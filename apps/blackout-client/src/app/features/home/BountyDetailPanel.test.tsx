// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { Bounty, BountyApplication } from '@blackout/core';

const applyToBounty = vi.fn();
const fetchBountyApplications = vi.fn();
const acceptBountyApplication = vi.fn();
const updateBountyStatus = vi.fn();
vi.mock('../bounty/bountyClient', () => ({
    applyToBounty: (...a: unknown[]) => applyToBounty(...a),
    fetchBountyApplications: (...a: unknown[]) => fetchBountyApplications(...a),
    acceptBountyApplication: (...a: unknown[]) => acceptBountyApplication(...a),
    updateBountyStatus: (...a: unknown[]) => updateBountyStatus(...a),
}));

import { BountyDetailPanel } from './BountyDetailPanel';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
        await flush();
    });
    return container;
};

const bounty: Bounty = {
    id: 'b1',
    category: 'creator',
    title: 'Need a TikTok campaign',
    description: 'Make 3 short videos',
    creatorId: '@poster:bmc',
    rewardType: 'cash',
    rewardSummary: '$50',
    requirements: ['portfolio'],
    deliverables: ['3 videos'],
    status: 'open',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
};

const application = (over: Partial<BountyApplication>): BountyApplication => ({
    id: 'a1',
    bountyId: 'b1',
    applicantId: '@alice:bmc',
    status: 'pending',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    ...over,
});

describe('BountyDetailPanel', () => {
    beforeEach(() => {
        applyToBounty.mockReset();
        fetchBountyApplications.mockReset();
        acceptBountyApplication.mockReset();
        updateBountyStatus.mockReset();
    });

    it('shows applicants to the poster and accepting one declines the rest', async () => {
        fetchBountyApplications.mockResolvedValue({
            applications: [
                application({ id: 'a1', applicantId: '@alice:bmc', message: 'I make food content' }),
                application({ id: 'a2', applicantId: '@bob:bmc' }),
            ],
        });
        acceptBountyApplication.mockResolvedValue({
            bounty: { ...bounty, status: 'claimed', claimedBy: '@alice:bmc' },
            application: application({ id: 'a1', applicantId: '@alice:bmc', status: 'accepted' }),
        });
        const container = await render(
            React.createElement(BountyDetailPanel, { bounty, onClose: () => {} }),
        );
        expect(fetchBountyApplications).toHaveBeenCalledWith('b1');
        expect(container.querySelector('[data-testid="bounty-detail-applicants"]')).not.toBeNull();
        const rows = container.querySelectorAll('[data-testid="bounty-applicant-row"]');
        expect(rows.length).toBe(2);
        // Accept alice.
        const acceptAlice = container.querySelector(
            '[data-testid="bounty-accept"][data-applicant="@alice:bmc"]',
        ) as HTMLButtonElement;
        await act(async () => {
            acceptAlice.click();
            await flush();
        });
        expect(acceptBountyApplication).toHaveBeenCalledWith('b1', '@alice:bmc');
        expect(container.textContent).toContain('accepted');
        expect(container.textContent).toContain('declined');
        // No pending Accept buttons remain.
        expect(container.querySelector('[data-testid="bounty-accept"]')).toBeNull();

        // The bounty is now claimed → the poster can mark it completed, which
        // records the reward.
        updateBountyStatus.mockResolvedValue({
            bounty: { ...bounty, status: 'completed', claimedBy: '@alice:bmc' },
            reward: { id: 'r1', status: 'earned' },
        });
        const complete = container.querySelector(
            '[data-testid="bounty-mark-completed"]',
        ) as HTMLButtonElement;
        expect(complete).not.toBeNull();
        await act(async () => {
            complete.click();
            await flush();
        });
        expect(updateBountyStatus).toHaveBeenCalledWith('b1', 'completed');
        expect(container.querySelector('[data-testid="bounty-detail-completed"]')).not.toBeNull();
    });

    it('shows the apply action when the viewer is not the poster', async () => {
        fetchBountyApplications.mockRejectedValue(new Error('forbidden'));
        applyToBounty.mockResolvedValue({ application: application({ status: 'pending' }) });
        const container = await render(
            React.createElement(BountyDetailPanel, { bounty, onClose: () => {} }),
        );
        const applyBtn = container.querySelector(
            '[data-testid="bounty-detail-apply"]',
        ) as HTMLButtonElement;
        expect(applyBtn).not.toBeNull();
        await act(async () => {
            applyBtn.click();
            await flush();
        });
        expect(applyToBounty).toHaveBeenCalledWith('b1');
        expect(applyBtn.textContent).toBe('Applied ✓');
    });
});
