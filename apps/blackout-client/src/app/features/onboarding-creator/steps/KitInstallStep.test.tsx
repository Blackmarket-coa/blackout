// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { CreatorStepDraft } from '../creatorOnboardingStyles';

const applyCreatorKitMock = vi.fn();
vi.mock('../../streaming/kits/applyKit', () => ({
    applyCreatorKit: (...args: unknown[]) => applyCreatorKitMock(...args),
}));

vi.mock('../../../hooks/useMatrixClient', () => ({
    useMatrixClientOrNull: () => ({ getSafeUserId: () => '@creator:bo' }),
}));

import { KitInstallStep } from './KitInstallStep';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const draft = (overrides: Partial<CreatorStepDraft> = {}): CreatorStepDraft => ({
    selectedArchetypes: ['streamer'],
    linkedProviders: [],
    selectedDenTypes: [],
    coalitionOptIn: undefined,
    enrolledRewardTier: undefined,
    installedKitId: undefined,
    firstActionId: undefined,
    ...overrides,
});

const render = async (props: { draft: CreatorStepDraft; patch: ReturnType<typeof vi.fn> }) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<KitInstallStep draft={props.draft} patch={props.patch} />);
        await flush();
    });
    return container;
};

describe('KitInstallStep', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
    });

    it('pre-highlights the kit suggested by the chosen archetypes', async () => {
        const container = await render({ draft: draft(), patch: vi.fn() });
        const streamerOption = container.querySelector(
            '[data-testid="creator-kit-option"][data-kit-id="streamer"]'
        ) as HTMLButtonElement;
        expect(streamerOption.getAttribute('data-suggested')).toBe('true');
        expect(streamerOption.getAttribute('aria-pressed')).toBe('true');
    });

    it('applies the kit and renders per-step results', async () => {
        applyCreatorKitMock.mockResolvedValue([
            { area: 'den', label: 'Fan den', status: 'ok' },
            { area: 'tier', label: 'Supporter', status: 'skipped' },
        ]);
        const patch = vi.fn();
        const container = await render({ draft: draft(), patch });
        const applyBtn = container.querySelector(
            '[data-testid="creator-kit-apply"]'
        ) as HTMLButtonElement;
        await act(async () => {
            applyBtn.click();
            await flush();
        });
        expect(applyCreatorKitMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'streamer' }),
            expect.objectContaining({ userId: '@creator:bo' })
        );
        expect(patch).toHaveBeenCalledWith({ installedKitId: 'streamer' });
        const results = container.querySelector('[data-testid="creator-kit-results"]');
        expect(results?.textContent).toContain('Fan den');
        expect(results?.querySelector('[data-step-status="skipped"]')).toBeTruthy();
    });
});
