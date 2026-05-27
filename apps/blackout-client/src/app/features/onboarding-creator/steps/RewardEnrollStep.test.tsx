// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { CreatorStepDraft } from '../creatorOnboardingStyles';

const fetchMyAmbassadorMock = vi.fn();
const applyAsAmbassadorMock = vi.fn();
vi.mock('../../growth', () => ({
    fetchMyAmbassador: () => fetchMyAmbassadorMock(),
    applyAsAmbassador: (opts: unknown) => applyAsAmbassadorMock(opts),
}));

import { RewardEnrollStep } from './RewardEnrollStep';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const draft = (overrides: Partial<CreatorStepDraft> = {}): CreatorStepDraft => ({
    selectedArchetypes: [],
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
        root.render(<RewardEnrollStep draft={props.draft} patch={props.patch} />);
        await flush();
    });
    return container;
};

describe('RewardEnrollStep', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
        fetchMyAmbassadorMock.mockResolvedValue({ ambassador: null });
    });

    it('enrolls as an ambassador and patches the tier', async () => {
        applyAsAmbassadorMock.mockResolvedValue({ ambassador: { tier: 'seedling' } });
        const patch = vi.fn();
        const container = await render({ draft: draft(), patch });
        const enrollBtn = container.querySelector(
            '[data-testid="creator-rewards-enroll"]'
        ) as HTMLButtonElement;
        await act(async () => {
            enrollBtn.click();
            await flush();
        });
        expect(applyAsAmbassadorMock).toHaveBeenCalled();
        expect(patch).toHaveBeenCalledWith({ enrolledRewardTier: 'seedling' });
    });

    it('reflects existing enrollment without re-applying', async () => {
        const container = await render({
            draft: draft({ enrolledRewardTier: 'sapling' }),
            patch: vi.fn(),
        });
        expect(
            container.querySelector('[data-testid="creator-rewards-enrolled"]')?.textContent
        ).toContain('sapling');
        expect(applyAsAmbassadorMock).not.toHaveBeenCalled();
    });
});
