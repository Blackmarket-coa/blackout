import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    previewInvitation,
    redeemInvitation,
} from '../../../../src/app/features/invitations/invitationsClient';

const jsonResponse = (status: number, body: unknown): Response =>
    ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    }) as unknown as Response;

describe('invitationsClient body-reading behavior', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves the typed {ok:true} body for a successful redeem', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse(200, { ok: true, matrixRoomId: '!r:server' }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(redeemInvitation('tok', 'jwt')).resolves.toEqual({
            ok: true,
            matrixRoomId: '!r:server',
        });
    });

    it('resolves (not throws) the {ok:false,reason} body for a 410 business failure', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse(410, { ok: false, reason: 'expired' }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(redeemInvitation('tok', 'jwt')).resolves.toEqual({
            ok: false,
            reason: 'expired',
        });
    });

    it('resolves the {valid:false,reason} body for a 404 preview', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse(404, { valid: false, reason: 'invalid' }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(previewInvitation('tok')).resolves.toEqual({
            valid: false,
            reason: 'invalid',
        });
    });

    it('rejects on 401 (unauthenticated) instead of treating it as a business outcome', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { code: 'unauthorized' }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(redeemInvitation('tok', null)).rejects.toThrow(/401/);
    });

    it('rejects on 5xx', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, {}));
        vi.stubGlobal('fetch', fetchMock);

        await expect(redeemInvitation('tok', 'jwt')).rejects.toThrow(/503/);
    });

    it('sends the bearer token for redeem and omits it for the public preview', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
        vi.stubGlobal('fetch', fetchMock);

        await redeemInvitation('tok', 'jwt-123');
        const redeemHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<
            string,
            string
        >;
        expect(redeemHeaders.authorization).toBe('Bearer jwt-123');

        fetchMock.mockResolvedValue(jsonResponse(200, { valid: true }));
        await previewInvitation('tok');
        const previewHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<
            string,
            string
        >;
        expect(previewHeaders.authorization).toBeUndefined();
    });
});
