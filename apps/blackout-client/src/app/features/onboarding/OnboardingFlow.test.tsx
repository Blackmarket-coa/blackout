// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = (await vi.importActual('react-router-dom')) as Record<string, unknown>;
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

vi.mock('../welcome/useWelcome', () => ({
    useWelcomeContent: () => ({
        data: {
            title: 'Welcome',
            description: 'Welcome description',
            featuredChannels: [],
        },
    }),
}));

const savePatchMock = vi.fn().mockResolvedValue({});
const markCompletedMock = vi.fn().mockResolvedValue({});
const resetMock = vi.fn().mockResolvedValue({});
let readSnapshot = {
    stepIndex: 0,
    skipped: false,
    completed: false,
    startedAt: 0,
    updatedAt: 0,
    selectedChannels: [] as string[],
};
const readMock = vi.fn(async () => readSnapshot);

vi.mock('./onboardingState', async () => {
    const actual = (await vi.importActual('./onboardingState')) as Record<string, unknown>;
    return {
        ...actual,
        useOnboardingProgress: () => ({
            read: readMock,
            savePatch: savePatchMock,
            markCompleted: markCompletedMock,
            reset: resetMock,
        }),
    };
});

import { OnboardingFlow } from './OnboardingFlow';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={['/onboarding/space-1']}>
                <Routes>
                    <Route
                        path="/onboarding/:spaceId"
                        element={<OnboardingFlow spaceId="space-1" />}
                    />
                </Routes>
            </MemoryRouter>
        );
        await flush();
    });
    return { container };
};

describe('OnboardingFlow choose-role step', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        navigateMock.mockReset();
        savePatchMock.mockClear();
        markCompletedMock.mockClear();
        readMock.mockClear();
        readSnapshot = {
            stepIndex: 0,
            skipped: false,
            completed: false,
            startedAt: 0,
            updatedAt: 0,
            selectedChannels: [],
        };
        // Reset the runtime flag at the start of each test (vitest 2.x
        // doesn't expose afterEach from this project's typed surface).
        runtimeFeatureFlags.onboardingCreatorPath = false;
    });

    it('renders only the Member option when onboardingCreatorPath is off', async () => {
        runtimeFeatureFlags.onboardingCreatorPath = false;
        const { container } = await mount();
        expect(container.querySelector('[data-testid="onboarding-role-member"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="onboarding-role-creator"]')).toBeNull();
    });

    it('renders both Member and Creator options when onboardingCreatorPath is on', async () => {
        runtimeFeatureFlags.onboardingCreatorPath = true;
        const { container } = await mount();
        expect(container.querySelector('[data-testid="onboarding-role-member"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="onboarding-role-creator"]')).not.toBeNull();
    });

    it('selecting Member persists role and advances into the next step', async () => {
        runtimeFeatureFlags.onboardingCreatorPath = true;
        const { container } = await mount();
        const memberButton = container.querySelector(
            '[data-testid="onboarding-role-member"]'
        ) as HTMLButtonElement | null;
        expect(memberButton).not.toBeNull();
        await act(async () => {
            memberButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });
        await act(async () => {
            await flush();
        });
        expect(savePatchMock).toHaveBeenCalledWith({ role: 'member' });
        // Second savePatch advances to next step (welcome_context = stepIndex 1).
        expect(savePatchMock).toHaveBeenCalledWith({ stepIndex: 1 });
        expect(navigateMock).not.toHaveBeenCalled();
        expect(markCompletedMock).not.toHaveBeenCalled();
    });

    it('selecting Creator persists role, marks complete, and navigates to /onboarding/creator', async () => {
        runtimeFeatureFlags.onboardingCreatorPath = true;
        const { container } = await mount();
        const creatorButton = container.querySelector(
            '[data-testid="onboarding-role-creator"]'
        ) as HTMLButtonElement | null;
        expect(creatorButton).not.toBeNull();
        await act(async () => {
            creatorButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });
        await act(async () => {
            await flush();
        });
        expect(savePatchMock).toHaveBeenCalledWith({ role: 'creator' });
        expect(markCompletedMock).toHaveBeenCalledWith(false);
        expect(navigateMock).toHaveBeenCalledWith('/onboarding/creator');
    });
});
