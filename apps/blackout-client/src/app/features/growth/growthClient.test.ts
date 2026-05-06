import { beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();

vi.mock('../../sdk/client', () => ({
    createAuthorizedApiClient: () => callMock,
}));

vi.mock('../monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));

import {
    applyAsAmbassador,
    completeQuest,
    fetchActiveQuests,
    fetchMyAmbassador,
    fetchMyQuestCompletions,
    fetchMyReferrals,
    recordReferral,
} from './growthClient';

describe('growthClient', () => {
    beforeEach(() => {
        callMock.mockReset();
        callMock.mockResolvedValue({ ok: true });
    });

    it('hits /v1/growth/referrals on POST and includes referee + sourceKind', async () => {
        await recordReferral('referee-1', { sourceKind: 'ambassador', sourceRef: 'amb-7' });
        expect(callMock).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1/growth/referrals',
            body: {
                refereeUserId: 'referee-1',
                sourceKind: 'ambassador',
                sourceRef: 'amb-7',
            },
        });
    });

    it('hits /v1/growth/referrals/me on GET', async () => {
        await fetchMyReferrals();
        expect(callMock).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v1/growth/referrals/me',
            body: undefined,
        });
    });

    it('hits /v1/growth/ambassadors/apply with optional tier', async () => {
        await applyAsAmbassador({ tier: 'canopy' });
        expect(callMock).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1/growth/ambassadors/apply',
            body: { tier: 'canopy' },
        });
    });

    it('hits /v1/growth/ambassadors/me on GET', async () => {
        await fetchMyAmbassador();
        expect(callMock).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v1/growth/ambassadors/me',
            body: undefined,
        });
    });

    it('hits /v1/growth/quests with optional sourceKind filter', async () => {
        await fetchActiveQuests({ sourceKind: 'system' });
        expect(callMock).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v1/growth/quests?sourceKind=system',
            body: undefined,
        });
    });

    it('hits /v1/growth/quests/:id/complete on POST', async () => {
        await completeQuest('quest-x');
        expect(callMock).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1/growth/quests/quest-x/complete',
            body: undefined,
        });
    });

    it('hits /v1/growth/quests/me/completions on GET', async () => {
        await fetchMyQuestCompletions();
        expect(callMock).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v1/growth/quests/me/completions',
            body: undefined,
        });
    });
});
