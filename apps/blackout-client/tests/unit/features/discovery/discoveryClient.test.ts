import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/client/blackoutApiSession', () => ({
    ensureBlackoutApiToken: vi.fn(async () => 'lazy-token'),
}));

import { indexCanopy } from '../../../../src/app/features/discovery/discoveryClient';
import { ensureBlackoutApiToken } from '../../../../src/client/blackoutApiSession';

const okResponse = (): Response =>
    ({
        ok: true,
        status: 202,
        json: async () => ({
            canopyId: '!c:srv',
            name: 'Crew',
            federationTier: 'local',
            indexedAt: 'now',
        }),
    } as unknown as Response);

const lastFetchInit = (fetchMock: ReturnType<typeof vi.fn>): RequestInit =>
    fetchMock.mock.calls.at(-1)![1] as RequestInit;

describe('discoveryClient.indexCanopy', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        (ensureBlackoutApiToken as ReturnType<typeof vi.fn>).mockResolvedValue('lazy-token');
    });
    afterEach(() => vi.restoreAllMocks());

    it('POSTs the canopy payload to /v1/discovery/index/canopies', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await indexCanopy({ canopyId: '!c:srv', name: 'Crew', summary: 'a den' }, 'tok');

        const [url, init] = fetchMock.mock.calls.at(-1)!;
        expect(String(url)).toContain('/v1/discovery/index/canopies');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({
            canopyId: '!c:srv',
            name: 'Crew',
            summary: 'a den',
        });
    });

    it('asserts the discovery.write capability and bearer auth', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await indexCanopy({ canopyId: '!c:srv', name: 'Crew' }, 'tok');

        const headers = lastFetchInit(fetchMock).headers as Record<string, string>;
        expect(headers.authorization).toBe('Bearer tok');
        expect(headers['x-blackout-capabilities']).toBe('discovery.write');
    });

    it('resolves the API token lazily when none is passed', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await indexCanopy({ canopyId: '!c:srv', name: 'Crew' });

        expect(ensureBlackoutApiToken).toHaveBeenCalledOnce();
        const headers = lastFetchInit(fetchMock).headers as Record<string, string>;
        expect(headers.authorization).toBe('Bearer lazy-token');
    });

    it('omits the Authorization header when no token can be resolved', async () => {
        (ensureBlackoutApiToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        const fetchMock = vi.fn().mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await indexCanopy({ canopyId: '!c:srv', name: 'Crew' });

        const headers = lastFetchInit(fetchMock).headers as Record<string, string>;
        expect(headers.authorization).toBeUndefined();
        expect(headers['x-blackout-capabilities']).toBe('discovery.write');
    });
});
