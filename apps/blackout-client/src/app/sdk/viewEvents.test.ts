// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../client/blackoutApiSession', () => ({
    ensureBlackoutApiToken: vi.fn(async () => 'fresh-token'),
    isBlackoutTokenExpired: vi.fn(() => false),
}));
vi.mock('../features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: vi.fn(() => 'stored-token'),
}));

import { recordViewEvent, __resetViewEventsForTests } from './viewEvents';

const fetchMock = vi.fn(async () => new Response('', { status: 202 }));

describe('viewEvents transport', () => {
    // Cleanup happens at the top of each case (this project's typed vitest
    // surface doesn't expose afterEach — see other tests under src/app).
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.useFakeTimers();
        fetchMock.mockClear();
        vi.stubGlobal('fetch', fetchMock);
        __resetViewEventsForTests();
    });

    const flushMicrotasks = async () => {
        await Promise.resolve();
        await Promise.resolve();
    };

    it('batches events and flushes them after the interval with a bearer token', async () => {
        recordViewEvent('feed_item_impression', { itemId: 'a', source: 'den' });
        recordViewEvent('feed_item_opened', { itemId: 'a', source: 'den' });
        expect(fetchMock).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(5_000);
        await flushMicrotasks();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toContain('/v1/telemetry/events');
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer stored-token');
        const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
        expect(body.events).toHaveLength(2);
        expect(body.events[0].eventType).toBe('feed_item_impression');
        expect(typeof body.events[0].occurredAtMs).toBe('number');
    });

    it('suppresses repeat events sharing a dedupeKey for the session', async () => {
        recordViewEvent('feed_item_impression', { itemId: 'a' }, { dedupeKey: 'impression:a' });
        recordViewEvent('feed_item_impression', { itemId: 'a' }, { dedupeKey: 'impression:a' });
        recordViewEvent('feed_item_impression', { itemId: 'b' }, { dedupeKey: 'impression:b' });

        await vi.advanceTimersByTimeAsync(5_000);
        await flushMicrotasks();

        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        const body = JSON.parse(String(init.body)) as { events: unknown[] };
        expect(body.events).toHaveLength(2);
    });

    it('flushes immediately when the queue reaches the eager threshold', async () => {
        for (let i = 0; i < 25; i++) {
            recordViewEvent('swipe_item_viewed', { index: i });
        }
        await flushMicrotasks();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('swallows network failures without throwing', async () => {
        fetchMock.mockRejectedValueOnce(new Error('offline'));
        recordViewEvent('feed_item_opened', { itemId: 'a' });
        await vi.advanceTimersByTimeAsync(5_000);
        await flushMicrotasks();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
