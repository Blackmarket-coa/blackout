// W1b: `creatorSubsApi.subscribe` now negotiates the FBM payment leg — the
// request may carry embed/returnUrl and the response returns
// redirectUrl/sessionId/embed alongside the pending subscription.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();

vi.mock('../../../../src/app/sdk/client', () => ({
    createAuthorizedApiClient: () => requestMock,
}));

const { creatorSubsApi } = await import(
    '../../../../src/app/features/monetization/monetizationApi'
);

describe('creatorSubsApi.subscribe (FBM payment leg)', () => {
    beforeEach(() => {
        requestMock.mockReset();
        requestMock.mockResolvedValue({
            subscription: { id: 'csub_1', status: 'pending' },
            redirectUrl: 'https://fbm.example/checkout/x',
            sessionId: 'sess_1',
            embed: true,
        });
    });

    it('posts only tierId when no options are given', async () => {
        await creatorSubsApi.subscribe('tier_1', 'token');
        expect(requestMock).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1/creator-subs/subscribe',
            body: { tierId: 'tier_1' },
        });
    });

    it('forwards embed + returnUrl and returns the payment leg', async () => {
        const result = await creatorSubsApi.subscribe('tier_1', 'token', {
            embed: true,
            returnUrl: 'https://app.example/creator',
        });
        expect(requestMock).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1/creator-subs/subscribe',
            body: {
                tierId: 'tier_1',
                embed: true,
                returnUrl: 'https://app.example/creator',
            },
        });
        expect(result.redirectUrl).toBe('https://fbm.example/checkout/x');
        expect(result.sessionId).toBe('sess_1');
        expect(result.embed).toBe(true);
        expect(result.subscription.status).toBe('pending');
    });
});
