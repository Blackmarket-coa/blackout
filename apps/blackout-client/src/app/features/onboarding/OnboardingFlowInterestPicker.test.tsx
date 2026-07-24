// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';

const navigateMock = vi.fn();
vi.mock('react-router', async () => {
    const actual = (await vi.importActual('react-router')) as Record<string, unknown>;
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

vi.mock('../welcome/useWelcome', () => ({
    useWelcomeContent: () => ({
        data: { title: 'Welcome', description: 'Welcome description', featuredChannels: [] },
    }),
}));

const joinRoomMock = vi.fn().mockResolvedValue({});
const fakeClient = {
    joinRoom: joinRoomMock,
    getAccountData: () => undefined,
    setAccountData: vi.fn().mockResolvedValue({}),
} as unknown;
vi.mock('../../hooks/useMatrixClient', () => ({
    useMatrixClient: () => fakeClient,
    useMatrixClientOrNull: () => fakeClient,
}));

const listTopicsMock = vi.fn();
const listCanopiesByTagMock = vi.fn();
vi.mock('../topics/topicsClient', () => ({
    listTopics: (...args: unknown[]) => listTopicsMock(...args),
    listCanopiesByTag: (...args: unknown[]) => listCanopiesByTagMock(...args),
}));

const writeDiscoveryInterestTagsMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../home/discoveryInterests', () => ({
    writeDiscoveryInterestTags: (...args: unknown[]) => writeDiscoveryInterestTagsMock(...args),
}));

const savePatchMock = vi.fn().mockResolvedValue({});
const markCompletedMock = vi.fn().mockResolvedValue({});
const resetMock = vi.fn().mockResolvedValue({});
let readSnapshot: Record<string, unknown> = {
    stepIndex: 0,
    skipped: false,
    completed: false,
    startedAt: 0,
    updatedAt: 0,
    selectedChannels: [],
    selectedInterests: [],
    seededCanopyIds: [],
};
const readMock = vi.fn(async () => readSnapshot);
const progressApi = {
    read: readMock,
    savePatch: savePatchMock,
    markCompleted: markCompletedMock,
    reset: resetMock,
};
vi.mock('./onboardingState', async () => {
    const actual = (await vi.importActual('./onboardingState')) as Record<string, unknown>;
    return { ...actual, useOnboardingProgress: () => progressApi };
});

import { OnboardingFlow } from './OnboardingFlow';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';

const flush = async () => {
    for (let i = 0; i < 12; i++) {
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

const clickContinue = async (container: HTMLElement) => {
    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    const cont = buttons.find((b) => b.textContent === 'Continue' || b.textContent === 'Finish');
    expect(cont).toBeTruthy();
    await act(async () => {
        cont!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
    });
    await act(async () => {
        await flush();
    });
};

describe('OnboardingFlow interest picker', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        navigateMock.mockReset();
        savePatchMock.mockClear();
        joinRoomMock.mockClear();
        writeDiscoveryInterestTagsMock.mockClear();
        listTopicsMock.mockReset();
        listCanopiesByTagMock.mockReset();
        listTopicsMock.mockResolvedValue({
            items: [
                { tag: 'music', count: 9 },
                { tag: 'news', count: 4 },
            ],
        });
        listCanopiesByTagMock.mockResolvedValue({
            tag: 'music',
            items: [
                { id: '!a:s', name: 'Music A', tags: ['music'], activityScore: 1 },
                { id: '!b:s', name: 'Music B', tags: ['music'], activityScore: 1 },
            ],
        });
        runtimeFeatureFlags.onboardingInterestPicker = true;
        runtimeFeatureFlags.onboardingCreatorPath = false;
        runtimeFeatureFlags.onboardingDeveloperStep = false;
        runtimeFeatureFlags.onboardingHomeTour = false;
        readSnapshot = {
            stepIndex: 2,
            skipped: false,
            completed: false,
            startedAt: 0,
            updatedAt: 0,
            selectedChannels: [],
            selectedInterests: [],
            seededCanopyIds: [],
        };
    });

    it('hides the interest steps when the flag is off', async () => {
        runtimeFeatureFlags.onboardingInterestPicker = false;
        readSnapshot = { ...readSnapshot, stepIndex: 0 };
        const { container } = await mount();
        expect(container.querySelector('[data-testid="onboarding-interest-picker"]')).toBeNull();
    });

    it('renders topic chips and persists selected interests on continue', async () => {
        const { container } = await mount();
        const picker = container.querySelector('[data-testid="onboarding-interest-picker"]');
        expect(picker).not.toBeNull();
        const chips = container.querySelectorAll('[data-testid="onboarding-interest-chip"]');
        expect(chips.length).toBe(2);

        await act(async () => {
            (chips[0] as HTMLButtonElement).dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            );
            await flush();
        });

        await clickContinue(container);

        expect(writeDiscoveryInterestTagsMock).toHaveBeenCalledWith(fakeClient, ['music']);
        expect(savePatchMock).toHaveBeenCalledWith(
            expect.objectContaining({ selectedInterests: ['music'], stepIndex: 3 })
        );
    });

    it('default-checks suggested communities and joins them on continue', async () => {
        readSnapshot = { ...readSnapshot, stepIndex: 3, selectedInterests: ['music'] };
        const { container } = await mount();
        expect(
            container.querySelector('[data-testid="onboarding-find-communities"]')
        ).not.toBeNull();
        const options = container.querySelectorAll('[data-testid="onboarding-community-option"]');
        expect(options.length).toBe(2);
        // Both suggestions default to checked.
        const checkboxes = container.querySelectorAll(
            '[data-testid="onboarding-community-option"] input[type="checkbox"]'
        );
        expect(Array.from(checkboxes).every((c) => (c as HTMLInputElement).checked)).toBe(true);

        await clickContinue(container);

        expect(joinRoomMock).toHaveBeenCalledTimes(2);
        expect(joinRoomMock).toHaveBeenCalledWith('!a:s');
        expect(joinRoomMock).toHaveBeenCalledWith('!b:s');
        expect(savePatchMock).toHaveBeenCalledWith(
            expect.objectContaining({ seededCanopyIds: ['!a:s', '!b:s'] })
        );
    });
});
