import { describe, expect, it, vi, afterEach } from 'vitest';

// Stub the auth-token reader so the client doesn't need a real Blackout session.
vi.mock('../../src/app/features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));

// Stub the SDK client to avoid hitting the network during unit tests.
const apiCall = vi.fn();
vi.mock('../../src/app/sdk/client', () => ({
    API_BASE_URL: '',
    createAuthorizedApiClient: () => apiCall,
    fetchAuthorizedBlob: vi.fn(),
}));

import {
    buildTenorBinaryUrl,
    fetchTenorFeatured,
    registerTenorShare,
    searchTenor,
    TenorDisabledError,
} from '../../src/app/features/room/tenorClient';
import { BlackoutSdkError } from '@blackout/sdk';

afterEach(() => {
    apiCall.mockReset();
});

describe('tenorClient', () => {
    it('searchTenor builds GET path with q + optional pos/limit', async () => {
        apiCall.mockResolvedValueOnce({ items: [], next: null });
        await searchTenor('cats', { pos: '24', limit: 30 });
        expect(apiCall).toHaveBeenCalledTimes(1);
        const arg = apiCall.mock.calls[0][0];
        expect(arg.method).toBe('GET');
        expect(arg.path).toBe('/v1/integrations/tenor/search?q=cats&pos=24&limit=30');
    });

    it('searchTenor omits unset params', async () => {
        apiCall.mockResolvedValueOnce({ items: [], next: null });
        await searchTenor('dogs');
        const arg = apiCall.mock.calls[0][0];
        expect(arg.path).toBe('/v1/integrations/tenor/search?q=dogs');
    });

    it('fetchTenorFeatured hits /featured with optional cursor', async () => {
        apiCall.mockResolvedValueOnce({ items: [], next: '48' });
        await fetchTenorFeatured({ pos: '24' });
        const arg = apiCall.mock.calls[0][0];
        expect(arg.method).toBe('GET');
        expect(arg.path).toBe('/v1/integrations/tenor/featured?pos=24');
    });

    it('translates 503 SdkError into TenorDisabledError', async () => {
        apiCall.mockRejectedValueOnce(
            new BlackoutSdkError(
                'HTTP_REQUEST_FAILED',
                'Request failed (503) for /v1/integrations/tenor/search',
                'fatal',
                503
            )
        );
        await expect(searchTenor('cats')).rejects.toBeInstanceOf(TenorDisabledError);
    });

    it('rethrows other SdkErrors verbatim', async () => {
        const err = new BlackoutSdkError(
            'HTTP_REQUEST_FAILED',
            'Request failed (500) for /v1/integrations/tenor/search',
            'fatal',
            500
        );
        apiCall.mockRejectedValueOnce(err);
        await expect(searchTenor('cats')).rejects.toBe(err);
    });

    it('registerTenorShare POSTs id + q', async () => {
        apiCall.mockResolvedValueOnce({ ok: true });
        await registerTenorShare('tenor-abc', 'cats');
        const arg = apiCall.mock.calls[0][0];
        expect(arg.method).toBe('POST');
        expect(arg.path).toBe('/v1/integrations/tenor/share');
        expect(arg.body).toEqual({ id: 'tenor-abc', q: 'cats' });
    });

    it('buildTenorBinaryUrl encodes the upstream URL into a query param', () => {
        expect(
            buildTenorBinaryUrl('https://media.tenor.com/abc/cat.gif', 'https://api.example.com')
        ).toBe(
            'https://api.example.com/v1/integrations/tenor/binary?url=https%3A%2F%2Fmedia.tenor.com%2Fabc%2Fcat.gif'
        );
    });

    it('buildTenorBinaryUrl works with empty base (same-origin)', () => {
        expect(buildTenorBinaryUrl('https://media.tenor.com/x.gif', '')).toBe(
            '/v1/integrations/tenor/binary?url=https%3A%2F%2Fmedia.tenor.com%2Fx.gif'
        );
    });
});
