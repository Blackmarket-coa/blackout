import { describe, expect, it } from 'vitest';
import { createFetchApiClient } from '@blackout/sdk';
import {
    createDestination,
    deleteDestination,
    isValidProvider,
    isValidRtmpUrl,
    listDestinations,
    PRESETS,
    setDestinationEnabled,
} from '../../../../../src/app/features/settings/simulcast-destinations/simulcastDestinationsClient';

const collectClient = () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const apiClient = createFetchApiClient({
        baseUrl: 'http://localhost:0',
        fetchFn: (async (url: RequestInfo | URL, init?: RequestInit) => {
            const u = typeof url === 'string' ? url : url.toString();
            calls.push({
                method: init?.method ?? 'GET',
                path: u.replace('http://localhost:0', ''),
                body: init?.body ? JSON.parse(String(init.body)) : undefined,
            });
            return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
        }) as unknown as typeof fetch,
    });
    return { apiClient, calls };
};

describe('simulcastDestinationsClient: wire contracts', () => {
    it('listDestinations → GET /v1/integrations/simulcast/destinations', async () => {
        const { apiClient, calls } = collectClient();
        await listDestinations({ apiClient });
        expect(calls).toEqual([
            { method: 'GET', path: '/v1/integrations/simulcast/destinations', body: undefined },
        ]);
    });

    it('createDestination → POST with the typed body (streamKey passes through ONCE)', async () => {
        const { apiClient, calls } = collectClient();
        await createDestination(
            {
                provider: 'twitch',
                label: 'Main',
                ingestUrl: 'rtmp://live.twitch.tv/app',
                streamKey: 'live_111_secret',
            },
            { apiClient },
        );
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/v1/integrations/simulcast/destinations',
                body: {
                    provider: 'twitch',
                    label: 'Main',
                    ingestUrl: 'rtmp://live.twitch.tv/app',
                    streamKey: 'live_111_secret',
                },
            },
        ]);
    });

    it('setDestinationEnabled → PUT /:id/enabled with {isEnabled}', async () => {
        const { apiClient, calls } = collectClient();
        await setDestinationEnabled('id-123', false, { apiClient });
        expect(calls).toEqual([
            {
                method: 'PUT',
                path: '/v1/integrations/simulcast/destinations/id-123/enabled',
                body: { isEnabled: false },
            },
        ]);
    });

    it('deleteDestination → DELETE /:id with the id URI-encoded', async () => {
        const { apiClient, calls } = collectClient();
        await deleteDestination('abc/123', { apiClient });
        expect(calls).toEqual([
            {
                method: 'DELETE',
                path: '/v1/integrations/simulcast/destinations/abc%2F123',
                body: undefined,
            },
        ]);
    });
});

describe('simulcastDestinationsClient.isValidRtmpUrl', () => {
    it('accepts rtmp:// and rtmps:// URLs', () => {
        expect(isValidRtmpUrl('rtmp://live.twitch.tv/app')).toBe(true);
        expect(isValidRtmpUrl('rtmps://x.example/path')).toBe(true);
        expect(isValidRtmpUrl('  rtmp://x/  ')).toBe(true); // trims
    });

    it('rejects HTTP(S), missing scheme, and whitespace-only', () => {
        expect(isValidRtmpUrl('https://example/')).toBe(false);
        expect(isValidRtmpUrl('live.twitch.tv/app')).toBe(false);
        expect(isValidRtmpUrl('')).toBe(false);
        expect(isValidRtmpUrl('rtmp://')).toBe(false); // no host (matches \S+; just /// is empty)
    });
});

describe('simulcastDestinationsClient.isValidProvider', () => {
    it('accepts lower-case ASCII provider names (1-32 chars)', () => {
        expect(isValidProvider('twitch')).toBe(true);
        expect(isValidProvider('youtube_live')).toBe(true);
        expect(isValidProvider('a')).toBe(true);
    });

    it('lower-cases internally so mixed-case input is accepted', () => {
        // The validator (and the server) treats provider as case-insensitive
        // and lowercases at the boundary. Document that explicitly so a
        // future tightener doesn't accidentally reject 'Twitch' from the UI.
        expect(isValidProvider('Twitch')).toBe(true);
    });

    it('rejects bad providers', () => {
        expect(isValidProvider('')).toBe(false);
        expect(isValidProvider('123twitch')).toBe(false); // digit start
        expect(isValidProvider('a'.repeat(33))).toBe(false);
        expect(isValidProvider('has space')).toBe(false);
    });
});

describe('simulcastDestinationsClient.PRESETS', () => {
    it('every preset has a valid RTMP URL + valid provider name', () => {
        for (const preset of PRESETS) {
            expect(isValidProvider(preset.provider), `preset ${preset.provider}`).toBe(true);
            expect(isValidRtmpUrl(preset.ingestUrl), `preset ${preset.provider} ingestUrl`).toBe(
                true,
            );
        }
    });
});
