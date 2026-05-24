import { beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
// preview/redeem route through `createFetchApiClient` (the body-resolving
// client), not `createAuthorizedApiClient`; mock both surfaces.
const fetchClientMock = vi.fn();
const createFetchApiClientMock = vi.fn(() => fetchClientMock);

vi.mock('../../sdk/client', () => ({
    createAuthorizedApiClient: () => callMock,
    API_BASE_URL: 'https://api.test',
}));

vi.mock('@blackout/sdk', () => ({
    createFetchApiClient: (opts: unknown) => createFetchApiClientMock(opts),
}));

vi.mock('../monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));

import {
    createInvitation,
    listMyInvitations,
    previewInvitation,
    redeemInvitation,
    revokeInvitation,
} from './invitationsClient';

describe('invitationsClient', () => {
    beforeEach(() => {
        callMock.mockReset();
        callMock.mockResolvedValue({ ok: true });
        fetchClientMock.mockReset();
        fetchClientMock.mockResolvedValue({ ok: true });
        createFetchApiClientMock.mockClear();
    });

    it('POSTs /v1/invitations with the create payload', async () => {
        await createInvitation({ matrixRoomId: '!abc:srv', label: 'crew', maxUses: 5 });
        expect(callMock).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1/invitations',
            body: { matrixRoomId: '!abc:srv', label: 'crew', maxUses: 5 },
        });
    });

    it('GETs /v1/invitations for the listing', async () => {
        await listMyInvitations();
        expect(callMock).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v1/invitations',
            body: undefined,
        });
    });

    it('DELETEs /v1/invitations/:id when revoking, encoding the id', async () => {
        await revokeInvitation('weird id/with slash');
        expect(callMock).toHaveBeenCalledWith({
            method: 'DELETE',
            path: '/v1/invitations/weird%20id%2Fwith%20slash',
            body: undefined,
        });
    });

    it('GETs the public preview endpoint with the token in the path', async () => {
        await previewInvitation('opaque-token-with/special?chars');
        expect(fetchClientMock).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v1/invitations/preview/opaque-token-with%2Fspecial%3Fchars',
            body: undefined,
            signal: undefined,
        });
        // Public preview must send no Authorization header (an expired bearer
        // would otherwise turn a valid preview into a 401).
        expect(createFetchApiClientMock).toHaveBeenCalledWith(
            expect.objectContaining({ defaultHeaders: undefined }),
        );
    });

    it('POSTs /v1/invitations/redeem with the token in the body', async () => {
        await redeemInvitation('redeem-token');
        expect(fetchClientMock).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1/invitations/redeem',
            body: { token: 'redeem-token' },
            signal: undefined,
        });
        // Redeem is authenticated with the Blackout API JWT.
        expect(createFetchApiClientMock).toHaveBeenCalledWith(
            expect.objectContaining({
                defaultHeaders: { authorization: 'Bearer test-token' },
            }),
        );
    });
});
