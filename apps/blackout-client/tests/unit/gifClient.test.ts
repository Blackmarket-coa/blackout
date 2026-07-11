import { describe, expect, it, vi, beforeEach } from 'vitest';

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
    __resetGifProviderForTests,
    buildGifBinaryUrl,
    fetchFeaturedGifs,
    GifDisabledError,
    registerGifShare,
    searchGifs,
} from '../../src/app/features/room/gifClient';
import { BlackoutSdkError } from '@blackout/sdk';

const disabled503 = (provider: string) =>
    new BlackoutSdkError(
        'HTTP_REQUEST_FAILED',
        `Request failed (503) for /v1/integrations/${provider}/search`,
        'fatal',
        503
    );

const emptyList = { items: [], next: null };

beforeEach(() => {
    apiCall.mockReset();
    __resetGifProviderForTests();
});

describe('gifClient provider resolution', () => {
    it('prefers Giphy and tags items with the provider', async () => {
        apiCall.mockResolvedValueOnce({
            items: [
                {
                    id: 'g1',
                    description: 'a gif',
                    gif: { url: 'https://media0.giphy.com/full.gif', width: 1, height: 1 },
                    preview: { url: 'https://media0.giphy.com/small.gif', width: 1, height: 1 },
                },
            ],
            next: '24',
        });
        const result = await searchGifs('cats', { pos: '0', limit: 24 });
        expect(apiCall).toHaveBeenCalledTimes(1);
        expect(apiCall.mock.calls[0][0].path).toBe(
            '/v1/integrations/giphy/search?q=cats&pos=0&limit=24'
        );
        expect(result.provider).toBe('giphy');
        expect(result.items[0].provider).toBe('giphy');
        expect(result.next).toBe('24');
    });

    it('falls back to Tenor when Giphy reports disabled (503)', async () => {
        apiCall.mockRejectedValueOnce(disabled503('giphy'));
        apiCall.mockResolvedValueOnce(emptyList);
        const result = await fetchFeaturedGifs();
        expect(apiCall).toHaveBeenCalledTimes(2);
        expect(apiCall.mock.calls[0][0].path).toBe('/v1/integrations/giphy/featured');
        expect(apiCall.mock.calls[1][0].path).toBe('/v1/integrations/tenor/featured');
        expect(result.provider).toBe('tenor');
    });

    it('pins the resolved provider for follow-up calls (cursor coherence)', async () => {
        apiCall.mockRejectedValueOnce(disabled503('giphy'));
        apiCall.mockResolvedValueOnce(emptyList);
        await fetchFeaturedGifs();
        apiCall.mockResolvedValueOnce(emptyList);
        await searchGifs('dogs', { pos: '24' });
        // No renewed Giphy attempt — Tenor stays pinned.
        expect(apiCall.mock.calls[2][0].path).toBe('/v1/integrations/tenor/search?q=dogs&pos=24');
    });

    it('throws GifDisabledError only when every provider is disabled', async () => {
        apiCall.mockRejectedValueOnce(disabled503('giphy'));
        apiCall.mockRejectedValueOnce(disabled503('tenor'));
        await expect(searchGifs('cats')).rejects.toBeInstanceOf(GifDisabledError);
    });

    it('rethrows non-503 errors without falling through', async () => {
        const err = new BlackoutSdkError(
            'HTTP_REQUEST_FAILED',
            'Request failed (500) for /v1/integrations/giphy/search',
            'fatal',
            500
        );
        apiCall.mockRejectedValueOnce(err);
        await expect(searchGifs('cats')).rejects.toBe(err);
        expect(apiCall).toHaveBeenCalledTimes(1);
    });
});

describe('gifClient share + binary helpers', () => {
    it('registerGifShare POSTs to Tenor for tenor items', async () => {
        apiCall.mockResolvedValueOnce({ ok: true });
        await registerGifShare({ id: 't1', provider: 'tenor' }, 'cats');
        expect(apiCall).toHaveBeenCalledTimes(1);
        const arg = apiCall.mock.calls[0][0];
        expect(arg.method).toBe('POST');
        expect(arg.path).toBe('/v1/integrations/tenor/share');
        expect(arg.body).toEqual({ id: 't1', q: 'cats' });
    });

    it('registerGifShare is a no-op for giphy items', async () => {
        await expect(registerGifShare({ id: 'g1', provider: 'giphy' }, 'cats')).resolves.toEqual({
            ok: true,
        });
        expect(apiCall).not.toHaveBeenCalled();
    });

    it('buildGifBinaryUrl routes to the item provider proxy', () => {
        expect(
            buildGifBinaryUrl('giphy', 'https://media0.giphy.com/x.gif', 'https://api.example.com')
        ).toBe(
            'https://api.example.com/v1/integrations/giphy/binary?url=https%3A%2F%2Fmedia0.giphy.com%2Fx.gif'
        );
        expect(buildGifBinaryUrl('tenor', 'https://media.tenor.com/x.gif', '')).toBe(
            '/v1/integrations/tenor/binary?url=https%3A%2F%2Fmedia.tenor.com%2Fx.gif'
        );
    });
});
