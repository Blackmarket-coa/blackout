/**
 * Where the coarse position and address searches go in a request
 * (features/coalition/coalitionClient.ts).
 *
 * Until 2026-11-17 they went in the query string, and every server and proxy
 * a request passed through wrote them to its access log beside the caller's
 * network address, while the location consent text said the server kept no
 * coarse position. They now travel in the body of a POST.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock('../../../../src/app/sdk/client', () => ({
    createAuthorizedApiClient:
        () => async (request: { method: string; path: string; body?: unknown }) => {
            requests.push(request);
            return { posts: [], locations: [], signals: [], count: 0, results: [] };
        },
}));
vi.mock('../../../../src/app/features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'token',
}));

// eslint-disable-next-line import/first
import {
    fetchMutualAid,
    fetchNearbySignals,
    fetchSellerLocations,
    geocodeAddress,
} from '../../../../src/app/features/coalition/coalitionClient';

const NEAR = { lat: 51.51, lng: -0.12, radiusKm: 5 };

beforeEach(() => {
    requests.length = 0;
});

describe('positions and address searches', () => {
    it('travel in the body of a POST, never in the address', async () => {
        await fetchNearbySignals(NEAR);
        await fetchMutualAid({ denId: '!den:server' }, NEAR);
        await fetchSellerLocations(NEAR);
        await geocodeAddress('12 Hidden Lane');

        expect(requests.map((r) => [r.method, r.path])).toEqual([
            ['POST', '/v1/coalition/nearby'],
            ['POST', '/v1/coalition/mutual-aid/search'],
            ['POST', '/v1/coalition/seller-locations/search'],
            ['POST', '/v1/coalition/geocode'],
        ]);
        for (const request of requests) {
            expect(request.path).not.toMatch(/[?&](lat|lng|radiusKm|q)=/);
        }
        expect(requests[0].body).toEqual(NEAR);
        expect(requests[1].body).toEqual({ ...NEAR, denId: '!den:server' });
        expect(requests[3].body).toEqual({ q: '12 Hidden Lane' });
    });

    it('a listing with no position stays a GET', async () => {
        await fetchMutualAid({ denId: '!den:server' });
        await fetchSellerLocations();
        expect(requests.map((r) => [r.method, r.path])).toEqual([
            ['GET', '/v1/coalition/mutual-aid?denId=%21den%3Aserver'],
            ['GET', '/v1/coalition/seller-locations'],
        ]);
    });
});
