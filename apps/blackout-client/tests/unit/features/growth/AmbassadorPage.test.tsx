// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { AmbassadorRecord } from '../../../../src/app/features/growth/growthClient';

const fetchMyAmbassador = vi.fn();
const applyAsAmbassador = vi.fn();
vi.mock('../../../../src/app/features/growth/growthClient', () => ({
    fetchMyAmbassador: (...a: unknown[]) => fetchMyAmbassador(...a),
    applyAsAmbassador: (...a: unknown[]) => applyAsAmbassador(...a),
}));

import { AmbassadorPage } from '../../../../src/app/features/growth/AmbassadorPage';

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

const ambassador = (over: Partial<AmbassadorRecord> = {}): AmbassadorRecord => ({
    id: 'a1',
    userId: '@me:bmc',
    tier: 'sapling',
    commissionBps: 750,
    quotaCanopiesActive: 3,
    status: 'active',
    startedAt: '2026-06-01T00:00:00.000Z',
    lastReviewedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
});

describe('AmbassadorPage', () => {
    beforeEach(() => {
        fetchMyAmbassador.mockReset();
        applyAsAmbassador.mockReset();
    });

    it('renders the application CTA when the viewer is not an ambassador', async () => {
        fetchMyAmbassador.mockResolvedValue({ ambassador: null });
        const container = await render(React.createElement(AmbassadorPage));
        expect(container.querySelector('[data-testid="growth-ambassador-apply"]')).not.toBeNull();
    });

    it('submits an application and shows the resulting status', async () => {
        fetchMyAmbassador.mockResolvedValue({ ambassador: null });
        applyAsAmbassador.mockResolvedValue({ ambassador: ambassador({ status: 'pending' }) });
        const container = await render(React.createElement(AmbassadorPage));

        const button = container.querySelector(
            '[data-testid="growth-ambassador-apply-button"]'
        ) as HTMLButtonElement;
        await act(async () => {
            button.click();
            await flush();
        });

        expect(applyAsAmbassador).toHaveBeenCalledTimes(1);
        expect(container.querySelector('[data-testid="growth-ambassador-status"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="growth-ambassador-tier"]')?.textContent).toBe(
            'sapling'
        );
    });

    it('renders the existing ambassador status on load', async () => {
        fetchMyAmbassador.mockResolvedValue({ ambassador: ambassador({ tier: 'canopy' }) });
        const container = await render(React.createElement(AmbassadorPage));
        expect(container.querySelector('[data-testid="growth-ambassador-tier"]')?.textContent).toBe(
            'canopy'
        );
        expect(applyAsAmbassador).not.toHaveBeenCalled();
    });

    it('surfaces a load error', async () => {
        fetchMyAmbassador.mockRejectedValue(new Error('nope'));
        const container = await render(React.createElement(AmbassadorPage));
        expect(container.querySelector('[data-testid="growth-ambassador-error"]')).not.toBeNull();
    });
});
