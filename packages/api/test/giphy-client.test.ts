/**
 * Unit tests for the Giphy client helpers in
 * `src/integrations/giphy/client.ts`. These don't touch the Hono app —
 * they exercise the reshaper, cursor mapper, and URL builder in isolation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    readGiphyConfig,
    giphySearch,
    toPickerItems,
    nextCursor,
    type GiphyListResponse,
} from '../src/integrations/giphy/client';

const listResponse = (
    data: GiphyListResponse['data'],
    pagination: GiphyListResponse['pagination']
): GiphyListResponse => ({ data, pagination });

test('giphy toPickerItems: parses string dims and drops results missing original', () => {
    const upstream = listResponse(
        [
            {
                id: 'good',
                title: 't',
                alt_text: 'a cat waving hello',
                images: {
                    original: {
                        url: 'https://media0.giphy.com/g/full.gif',
                        width: '320',
                        height: '240',
                        size: '12345',
                    },
                    fixed_width_small: {
                        url: 'https://media0.giphy.com/g/small.gif',
                        width: '100',
                        height: '75',
                    },
                },
            },
            {
                // No original rendition — filtered out.
                id: 'no-original',
                title: 'broken',
                images: {
                    fixed_width_small: {
                        url: 'https://media0.giphy.com/x/small.gif',
                        width: '100',
                        height: '75',
                    },
                },
            },
            {
                // No small rendition — preview falls back to fixed_width, then original.
                id: 'no-small',
                title: 'falls-back',
                images: {
                    original: {
                        url: 'https://media0.giphy.com/y/full.gif',
                        width: '200',
                        height: '200',
                    },
                },
            },
        ],
        { total_count: 3, count: 3, offset: 0 }
    );
    const items = toPickerItems(upstream);
    assert.equal(items.length, 2);
    assert.equal(items[0].id, 'good');
    assert.equal(items[0].description, 'a cat waving hello');
    assert.deepEqual(items[0].gif, {
        url: 'https://media0.giphy.com/g/full.gif',
        width: 320,
        height: 240,
        size: 12345,
    });
    assert.equal(items[0].preview.url, 'https://media0.giphy.com/g/small.gif');
    assert.equal(items[1].id, 'no-small');
    assert.equal(items[1].preview.url, items[1].gif.url);
});

test('giphy toPickerItems: falls back alt_text → title → "GIF" for description', () => {
    const images = {
        original: { url: 'https://media0.giphy.com/g/full.gif', width: '1', height: '1' },
    };
    const items = toPickerItems(
        listResponse(
            [
                { id: 'alt', title: 'short title', alt_text: 'alt wins', images },
                { id: 'title', title: 'title fallback', images },
                { id: 'bare', images },
            ],
            { total_count: 3, count: 3, offset: 0 }
        )
    );
    assert.equal(items[0].description, 'alt wins');
    assert.equal(items[1].description, 'title fallback');
    assert.equal(items[2].description, 'GIF');
});

test('giphy nextCursor: emits next offset as a string cursor, null at end', () => {
    assert.equal(nextCursor(listResponse([], { total_count: 100, count: 24, offset: 0 })), '24');
    assert.equal(nextCursor(listResponse([], { total_count: 100, count: 24, offset: 24 })), '48');
    // Exhausted: offset+count reaches total.
    assert.equal(nextCursor(listResponse([], { total_count: 48, count: 24, offset: 24 })), null);
    // Empty page: no further cursor even if total says otherwise.
    assert.equal(nextCursor(listResponse([], { total_count: 100, count: 0, offset: 24 })), null);
});

test('readGiphyConfig: reports missing api key', () => {
    const out = readGiphyConfig({} as NodeJS.ProcessEnv);
    assert.deepEqual(out, { error: 'missing_api_key' });
});

test('readGiphyConfig: returns trimmed api key', () => {
    const out = readGiphyConfig({ GIPHY_API_KEY: '  abc-key  ' } as NodeJS.ProcessEnv);
    assert.deepEqual(out, { apiKey: 'abc-key' });
});

test('giphySearch: clamps limit to [1, 50], maps pos → offset, forwards rating', async () => {
    let capturedUrl = '';
    const fakeFetch: typeof fetch = async (url) => {
        capturedUrl = String(url);
        return new Response(
            JSON.stringify({ data: [], pagination: { total_count: 0, count: 0, offset: 0 } }),
            { status: 200, headers: { 'content-type': 'application/json' } }
        );
    };
    await giphySearch({ apiKey: 'k', fetchFn: fakeFetch }, { q: 'cats', pos: '24', limit: 9999 });
    const u = new URL(capturedUrl);
    assert.equal(u.searchParams.get('api_key'), 'k');
    assert.equal(u.searchParams.get('q'), 'cats');
    assert.equal(u.searchParams.get('offset'), '24');
    assert.equal(u.searchParams.get('limit'), '50');
    assert.equal(u.searchParams.get('rating'), 'pg-13');
    assert.equal(u.searchParams.get('bundle'), 'messaging_non_clips');

    await giphySearch({ apiKey: 'k', fetchFn: fakeFetch }, { q: 'cats', pos: 'garbage', limit: 0 });
    const u2 = new URL(capturedUrl);
    assert.equal(u2.searchParams.get('offset'), '0');
    assert.equal(u2.searchParams.get('limit'), '1');
});
