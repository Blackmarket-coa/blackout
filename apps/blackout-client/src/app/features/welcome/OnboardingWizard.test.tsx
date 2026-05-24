// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Controllable onboarding content/completion. The wizard reads both hooks;
// these stubs let each test pick whether the canopy has configured steps and
// whether the user already completed onboarding.
let contentData = { enabled: false, steps: [] as unknown[] };
const readCompletion = vi.fn(async () => false);
const markCompleted = vi.fn(async () => {});

vi.mock('./useWelcome', async () => {
    const actual = (await vi.importActual('./useWelcome')) as Record<string, unknown>;
    return {
        ...actual,
        useOnboardingContent: () => ({ data: contentData }),
        useOnboardingCompletion: () => ({ readCompletion, markCompleted }),
    };
});

import { OnboardingWizard } from './OnboardingWizard';
import { DEFAULT_ONBOARDING_STEPS } from './useWelcome';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const mount = async (props: Partial<React.ComponentProps<typeof OnboardingWizard>> = {}) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <OnboardingWizard
                spaceId="!canopy:srv"
                open
                onClose={() => {}}
                {...props}
            />,
        );
        await flush();
    });
    return { container };
};

describe('OnboardingWizard fallback steps', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        contentData = { enabled: false, steps: [] };
        readCompletion.mockReset();
        readCompletion.mockResolvedValue(false);
        markCompleted.mockReset();
        markCompleted.mockResolvedValue(undefined);
    });

    it('renders the default wizard when content is disabled but fallbackSteps are given', async () => {
        // This is the full-page invite entry (OnboardingPage) path.
        const { container } = await mount({ fallbackSteps: DEFAULT_ONBOARDING_STEPS });
        expect(container.textContent).toContain('Welcome to Blackout');
    });

    it('renders nothing when content is disabled and no fallbackSteps are given', async () => {
        // This is the in-ClientLayout modal path — must stay opt-in so existing
        // users in unconfigured canopies are not interrupted.
        const { container } = await mount();
        expect(container.innerHTML).toBe('');
    });

    it('prefers the canopy-configured steps over the fallback when enabled', async () => {
        contentData = {
            enabled: true,
            steps: [{ type: 'rules', title: 'House Rules', content: 'Be excellent.' }],
        };
        const { container } = await mount({ fallbackSteps: DEFAULT_ONBOARDING_STEPS });
        expect(container.textContent).toContain('House Rules');
        expect(container.textContent).not.toContain('Welcome to Blackout');
    });
});
