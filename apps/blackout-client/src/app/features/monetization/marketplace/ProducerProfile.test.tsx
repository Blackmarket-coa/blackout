// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { ProducerProfile as ProducerProfileRecord } from './marketplaceClient';

const fetchProducerProfile = vi.fn();
const updateMyProducerProfile = vi.fn();
vi.mock('./marketplaceClient', () => ({
    fetchProducerProfile: (...a: unknown[]) => fetchProducerProfile(...a),
    updateMyProducerProfile: (...a: unknown[]) => updateMyProducerProfile(...a),
}));
vi.mock('./useMarketplaceAuth', () => ({ readBlackoutApiToken: () => 'tok' }));
vi.mock('../../streams/channelPointsClient', () => ({ decodeBlackoutUserId: () => 'me-1' }));

import { ProducerProfile } from './ProducerProfile';

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

const rec = (over: Partial<ProducerProfileRecord> = {}): ProducerProfileRecord => ({
    userId: 'me-1',
    providerId: 'freeblackmarket',
    displayName: 'Fungi Collective',
    bio: 'Mushroom kits.',
    avatarUrl: null,
    reputationTier: 'trusted',
    vacationMode: false,
    updatedAt: '2026-06-07T00:00:00.000Z',
    ...over,
});

describe('ProducerProfile', () => {
    beforeEach(() => {
        fetchProducerProfile.mockReset();
        updateMyProducerProfile.mockReset();
    });

    it('renders the read-view for an existing profile', async () => {
        fetchProducerProfile.mockResolvedValue(rec());
        const container = await render(React.createElement(ProducerProfile, { userId: 'me-1' }));
        expect(container.querySelector('[data-testid="producer-profile"]')).not.toBeNull();
        expect(container.textContent).toContain('Fungi Collective');
        expect(container.textContent).toContain('trusted');
    });

    it('shows an empty-state create prompt when editable and no profile exists', async () => {
        fetchProducerProfile.mockResolvedValue(null);
        const container = await render(React.createElement(ProducerProfile, { editable: true }));
        expect(container.querySelector('[data-testid="producer-profile-empty"]')).not.toBeNull();
    });

    it('renders nothing for a non-editable missing profile', async () => {
        fetchProducerProfile.mockResolvedValue(null);
        const container = await render(React.createElement(ProducerProfile, { userId: 'other-1' }));
        expect(container.querySelector('section')).toBeNull();
    });
});
