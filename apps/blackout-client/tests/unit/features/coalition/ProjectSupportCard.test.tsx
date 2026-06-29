// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const mocks = vi.hoisted(() => ({
    fetchCoalitionProject: vi.fn(),
    fetchProjectSupporters: vi.fn(),
    supportCoalitionProject: vi.fn(),
}));

vi.mock('../../../../src/app/features/coalition/coalitionClient', () => ({
    fetchCoalitionProject: mocks.fetchCoalitionProject,
    fetchProjectSupporters: mocks.fetchProjectSupporters,
    supportCoalitionProject: mocks.supportCoalitionProject,
}));

// eslint-disable-next-line import/first
import { ProjectSupportCard } from '../../../../src/app/features/coalition/tabs/ProjectSupportCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PROJECT_VIEW = {
    project: {
        id: 'proj-1',
        canopyId: '!c:blackout',
        title: 'Neighborhood greenhouse',
        category: 'community_garden',
        status: 'active',
        leadId: '@lead',
        fundingGoalCents: 10000,
        raisedCents: 6200,
        currency: 'USD',
        supporterCount: 12,
        milestones: [],
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-06-01T00:00:00Z',
    },
    progress: 0.62,
    momentum: { recencyScore: 0.5, velocityScore: 0.5, surgeFactor: 0.6, momentum: 0.55 },
    endowedProgress: {
        percentAlreadyEnabled: 0.62,
        contributionPercent: 0,
        headStartReason: 'Supporters before you already moved this forward.',
    },
    recentSupporters: [
        { supporterUserId: '@ada', amountCents: 1000, currency: 'USD', createdAt: 'now' },
    ],
};

const mountedRoots: ReactDOM.Root[] = [];

const flush = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};

const render = async (element: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(element);
    });
    await flush();
    mountedRoots.push(root);
    return container;
};

beforeEach(() => {
    mocks.fetchCoalitionProject.mockResolvedValue(PROJECT_VIEW);
    mocks.fetchProjectSupporters.mockResolvedValue({ supporters: PROJECT_VIEW.recentSupporters });
    mocks.supportCoalitionProject.mockResolvedValue({
        tip: { id: 't1', status: 'pending', grossCents: 1000 },
    });
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('ProjectSupportCard', () => {
    it('renders the progress bar and endowed-progress framing', async () => {
        const container = await render(<ProjectSupportCard projectId="proj-1" />);

        const progress = container.querySelector(
            '[data-testid="coalition-project-progress-proj-1"]'
        );
        expect(progress?.textContent).toContain('62%');

        const bar = container.querySelector('[role="progressbar"]');
        expect(bar?.getAttribute('aria-valuenow')).toBe('62');

        // Endowed-progress framing leads with what's already enabled.
        expect(container.textContent).toContain('already part of 62%');
        // Social proof: supporter wall.
        expect(container.textContent).toContain('@ada');
    });

    it('submits a contribution via the client', async () => {
        const container = await render(<ProjectSupportCard projectId="proj-1" />);

        const button = container.querySelector(
            '[data-testid="coalition-project-support-button-proj-1"]'
        ) as HTMLButtonElement;
        expect(button).toBeTruthy();

        await act(async () => {
            button.click();
        });
        await flush();

        // Default amount is $10 → 1000 cents.
        expect(mocks.supportCoalitionProject).toHaveBeenCalledWith('proj-1', {
            grossCents: 1000,
            currency: 'USD',
        });
    });
});
