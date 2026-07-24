// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CreatorOnboardingProgress } from './creatorOnboardingState';

const navigateMock = vi.fn();
vi.mock('react-router', async () => {
    const actual = (await vi.importActual('react-router')) as Record<string, unknown>;
    return { ...actual, useNavigate: () => navigateMock };
});

const savePatchMock = vi.fn().mockResolvedValue({});
const markCompletedMock = vi.fn().mockResolvedValue({});
const resetMock = vi.fn().mockResolvedValue({});
let readSnapshot: CreatorOnboardingProgress;
const readMock = vi.fn(async () => readSnapshot);

const progressApi = {
    read: readMock,
    savePatch: savePatchMock,
    markCompleted: markCompletedMock,
    reset: resetMock,
};
vi.mock('./creatorOnboardingState', async () => {
    const actual = (await vi.importActual('./creatorOnboardingState')) as Record<string, unknown>;
    return { ...actual, useCreatorOnboardingProgress: () => progressApi };
});

const memberMarkCompletedMock = vi.fn().mockResolvedValue({});
vi.mock('../onboarding/onboardingState', async () => {
    const actual = (await vi.importActual('../onboarding/onboardingState')) as Record<
        string,
        unknown
    >;
    return {
        ...actual,
        useOnboardingProgress: () => ({
            read: vi.fn(),
            savePatch: vi.fn(),
            markCompleted: memberMarkCompletedMock,
            reset: vi.fn(),
        }),
    };
});

import { CreatorOnboarding } from './CreatorOnboarding';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const baseSnapshot = (): CreatorOnboardingProgress => ({
    creatorStepIndex: 0,
    skipped: false,
    creatorCompleted: false,
    startedAt: 1000,
    updatedAt: 1000,
    selectedArchetypes: [],
    linkedProviders: [],
    selectedDenTypes: [],
});

const mount = async (entry = '/onboarding/creator?from=!space:bo') => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={[entry]}>
                <Routes>
                    <Route path="/onboarding/creator" element={<CreatorOnboarding />} />
                </Routes>
            </MemoryRouter>
        );
        await flush();
    });
    return { container };
};

describe('CreatorOnboarding wizard', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
        readSnapshot = baseSnapshot();
        // Keep the gated steps (platform_linking / rewards / kit) out so the
        // shell test exercises navigation without network-backed steps.
        runtimeFeatureFlags.onboardingCreatorPlatformLinking = false;
        runtimeFeatureFlags.onboardingCreatorRewards = false;
        runtimeFeatureFlags.onboardingCreatorKits = false;
    });

    it('renders the identity step first and gates Continue until an archetype is chosen', async () => {
        const { container } = await mount();
        expect(container.querySelector('[data-testid="creator-step-identity"]')).toBeTruthy();
        const continueBtn = container.querySelector(
            '[data-testid="creator-onboarding-continue"]'
        ) as HTMLButtonElement;
        expect(continueBtn.disabled).toBe(true);

        const chip = container.querySelector(
            '[data-testid="creator-archetype-chip"][data-archetype-id="streamer"]'
        ) as HTMLButtonElement;
        await act(async () => {
            chip.click();
            await flush();
        });
        expect(continueBtn.disabled).toBe(false);
        expect(savePatchMock).toHaveBeenCalledWith(
            expect.objectContaining({ selectedArchetypes: ['streamer'] })
        );
    });

    it('advances to the next visible step on Continue and persists the index', async () => {
        const { container } = await mount();
        const chip = container.querySelector(
            '[data-testid="creator-archetype-chip"][data-archetype-id="educator"]'
        ) as HTMLButtonElement;
        await act(async () => {
            chip.click();
            await flush();
        });
        const continueBtn = container.querySelector(
            '[data-testid="creator-onboarding-continue"]'
        ) as HTMLButtonElement;
        await act(async () => {
            continueBtn.click();
            await flush();
        });
        expect(container.querySelector('[data-testid="creator-step-hub-setup"]')).toBeTruthy();
        expect(savePatchMock).toHaveBeenCalledWith(
            expect.objectContaining({ creatorStepIndex: 1 })
        );
    });

    it('resumes at the persisted step index', async () => {
        // visibleSteps with gated steps off: identity, hub_setup, dens, coalition, first_action.
        readSnapshot = { ...baseSnapshot(), creatorStepIndex: 2 };
        const { container } = await mount();
        expect(container.querySelector('[data-testid="creator-step-dens"]')).toBeTruthy();
    });

    it('finishes on the last step: marks both stores complete and navigates', async () => {
        readSnapshot = {
            ...baseSnapshot(),
            creatorStepIndex: 4,
            selectedArchetypes: ['streamer'],
            firstActionId: 'schedule_event',
        };
        const { container } = await mount();
        expect(container.querySelector('[data-testid="creator-step-first-action"]')).toBeTruthy();
        const finishBtn = container.querySelector(
            '[data-testid="creator-onboarding-continue"]'
        ) as HTMLButtonElement;
        expect(finishBtn.textContent).toContain('Finish');
        await act(async () => {
            finishBtn.click();
            await flush();
        });
        expect(markCompletedMock).toHaveBeenCalledWith(false);
        expect(memberMarkCompletedMock).toHaveBeenCalledWith(false);
        expect(navigateMock).toHaveBeenCalledWith('/events');
    });

    it('shows the terminal card when already completed', async () => {
        readSnapshot = { ...baseSnapshot(), creatorCompleted: true };
        const { container } = await mount();
        expect(container.querySelector('[data-testid="creator-onboarding-restart"]')).toBeTruthy();
    });
});
