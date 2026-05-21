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

// Stable reference across renders — the production hook memoizes its return
// value, so the test mock should too. Otherwise the OnboardingFlow effect
// (whose deps include `progress`) re-fires on every render and clobbers local
// state set by user interactions.
const progressApi = {
    read: readMock,
    savePatch: savePatchMock,
    markCompleted: markCompletedMock,
    reset: resetMock,
};

vi.mock('./onboardingState', async () => {
    const actual = (await vi.importActual('./onboardingState')) as Record<string, unknown>;
    return {
        ...actual,
        useOnboardingProgress: () => progressApi,
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
        resetMock.mockClear();
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

    it('selecting Creator persists role and navigates to /onboarding/creator without marking the member flow done', async () => {
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
        // Member-flow completion stays in the hands of the creator wizard, so
        // the role-select hand-off must NOT call markCompleted.
        expect(markCompletedMock).not.toHaveBeenCalled();
        expect(navigateMock).toHaveBeenCalledWith('/onboarding/creator');
    });

    it('mounting with a {role: creator, completed: false} snapshot renders the hand-off panel', async () => {
        runtimeFeatureFlags.onboardingCreatorPath = true;
        readSnapshot = {
            stepIndex: 0,
            skipped: false,
            completed: false,
            startedAt: 0,
            updatedAt: 0,
            selectedChannels: [],
            role: 'creator',
        } as typeof readSnapshot;
        const { container } = await mount();
        expect(
            container.querySelector('[data-testid="onboarding-creator-handoff"]'),
        ).not.toBeNull();
        // Role-select must NOT render when we're in the hand-off state.
        expect(container.querySelector('[data-testid="onboarding-role-options"]')).toBeNull();
        expect(
            container.querySelector('[data-testid="onboarding-creator-continue"]'),
        ).not.toBeNull();
        expect(
            container.querySelector('[data-testid="onboarding-switch-to-member"]'),
        ).not.toBeNull();
    });

    it('switching back to the member flow from the hand-off panel resets role to undefined', async () => {
        runtimeFeatureFlags.onboardingCreatorPath = true;
        readSnapshot = {
            stepIndex: 0,
            skipped: false,
            completed: false,
            startedAt: 0,
            updatedAt: 0,
            selectedChannels: [],
            role: 'creator',
        } as typeof readSnapshot;
        const { container } = await mount();
        const switchButton = container.querySelector(
            '[data-testid="onboarding-switch-to-member"]',
        ) as HTMLButtonElement | null;
        expect(switchButton).not.toBeNull();
        await act(async () => {
            switchButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });
        // Second flush picks up state updates queued after the awaited
        // savePatch() inside the click handler.
        await act(async () => {
            await flush();
        });
        expect(savePatchMock).toHaveBeenCalledWith({ role: undefined, stepIndex: 0 });
        // The hand-off panel disappears; role-select reappears.
        expect(
            container.querySelector('[data-testid="onboarding-creator-handoff"]'),
        ).toBeNull();
        expect(container.querySelector('[data-testid="onboarding-role-options"]')).not.toBeNull();
    });

    it('restart from the completed view resets progress without a full page reload', async () => {
        readSnapshot = {
            stepIndex: 4,
            skipped: false,
            completed: true,
            startedAt: 0,
            updatedAt: 0,
            selectedChannels: [],
        };
        const reloadSpy = vi.fn();
        const originalLocation = window.location;
        // jsdom blocks redefining `window.location.reload` directly on some
        // versions, so swap the location object for the duration of the test.
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, reload: reloadSpy, assign: vi.fn() },
        });
        try {
            const { container } = await mount();
            const restartButton = container.querySelector(
                '[data-testid="onboarding-restart"]',
            ) as HTMLButtonElement | null;
            expect(restartButton).not.toBeNull();
            // Set the next snapshot the load-effect will read after reset().
            readSnapshot = {
                stepIndex: 0,
                skipped: false,
                completed: false,
                startedAt: Date.now(),
                updatedAt: Date.now(),
                selectedChannels: [],
            };
            await act(async () => {
                restartButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                await flush();
            });
            await act(async () => {
                await flush();
            });
            expect(resetMock).toHaveBeenCalledTimes(1);
            expect(reloadSpy).not.toHaveBeenCalled();
            // After restart, the role-select step renders again.
            expect(
                container.querySelector('[data-testid="onboarding-role-options"]'),
            ).not.toBeNull();
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('renders a progress bar reflecting the current step', async () => {
        const { container } = await mount();
        const bar = container.querySelector(
            '[data-testid="onboarding-progress-bar"]',
        ) as HTMLDivElement | null;
        expect(bar).not.toBeNull();
        // Inner fill width = (1/5) * 100 = 20%.
        const fill = bar!.querySelector('div') as HTMLDivElement | null;
        expect(fill).not.toBeNull();
        expect(fill!.style.width).toBe('20%');
    });

    it('omits the developer-tools step when the flag is off', async () => {
        runtimeFeatureFlags.onboardingDeveloperStep = false;
        readSnapshot = {
            stepIndex: 4,
            skipped: false,
            completed: false,
            startedAt: 0,
            updatedAt: 0,
            selectedChannels: [],
        };
        const { container } = await mount();
        // Last visible step is first_contribution (stepIndex 4 of 5). The
        // developer-tools section must not render.
        expect(container.querySelector('[data-testid="onboarding-developer-step"]')).toBeNull();
        const bar = container.querySelector(
            '[data-testid="onboarding-progress-bar"]',
        ) as HTMLDivElement | null;
        const fill = bar!.querySelector('div') as HTMLDivElement | null;
        // (5/5) * 100 = 100%.
        expect(fill!.style.width).toBe('100%');
    });

    it('renders the developer-tools step with file paths and doc links when flag is on', async () => {
        runtimeFeatureFlags.onboardingDeveloperStep = true;
        readSnapshot = {
            stepIndex: 5,
            skipped: false,
            completed: false,
            startedAt: 0,
            updatedAt: 0,
            selectedChannels: [],
        };
        try {
            const { container } = await mount();
            expect(
                container.querySelector('[data-testid="onboarding-developer-step"]'),
            ).not.toBeNull();
            const files = container.querySelector(
                '[data-testid="onboarding-developer-file-paths"]',
            );
            expect(files).not.toBeNull();
            expect(files!.querySelectorAll('li').length).toBeGreaterThan(0);
            const docLinks = container.querySelector(
                '[data-testid="onboarding-developer-doc-links"]',
            );
            expect(docLinks).not.toBeNull();
            expect(docLinks!.querySelectorAll('a').length).toBeGreaterThan(0);
            expect(
                container.querySelector('[data-testid="onboarding-developer-bundle"]'),
            ).not.toBeNull();
        } finally {
            runtimeFeatureFlags.onboardingDeveloperStep = false;
        }
    });
});
