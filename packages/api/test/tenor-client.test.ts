/**
 * Unit tests for the Tenor v2 client helpers in
 * `src/integrations/tenor/client.ts`. These don't touch the Hono app —
 * they exercise the reshaper and URL builder in isolation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readTenorConfig,
  tenorSearch,
  toPickerItems,
  type TenorListResponse,
} from '../src/integrations/tenor/client';

test('toPickerItems: drops results missing a full-size gif format', () => {
  const upstream: TenorListResponse = {
    next: '24',
    results: [
      {
        id: 'good',
        title: 't',
        content_description: 'd',
        media_formats: {
          gif: { url: 'https://media.tenor.com/g/full.gif', dims: [320, 240] },
          tinygif: { url: 'https://media.tenor.com/g/tiny.gif', dims: [120, 90] },
        },
      },
      {
        id: 'no-gif',
        title: 'broken',
        content_description: '',
        media_formats: {
          tinygif: { url: 'https://media.tenor.com/x/tiny.gif', dims: [120, 90] },
        },
      },
      {
        id: 'no-tiny',
        title: 'falls-back-to-full',
        content_description: '',
        media_formats: {
          gif: { url: 'https://media.tenor.com/y/full.gif', dims: [200, 200] },
        },
      },
    ],
  };
  const items = toPickerItems(upstream);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, 'good');
  assert.equal(items[0].gif.url, 'https://media.tenor.com/g/full.gif');
  assert.equal(items[0].preview.url, 'https://media.tenor.com/g/tiny.gif');
  // When tinygif is missing, preview falls back to the full gif.
  assert.equal(items[1].id, 'no-tiny');
  assert.equal(items[1].preview.url, items[1].gif.url);
});

test('toPickerItems: prefers content_description over title for description', () => {
  const upstream: TenorListResponse = {
    next: '',
    results: [
      {
        id: 'x',
        title: 'short title',
        content_description: 'a longer alt-text-friendly description',
        media_formats: {
          gif: { url: 'https://media.tenor.com/g/full.gif', dims: [1, 1] },
          tinygif: { url: 'https://media.tenor.com/g/tiny.gif', dims: [1, 1] },
        },
      },
    ],
  };
  const items = toPickerItems(upstream);
  assert.equal(items[0].description, 'a longer alt-text-friendly description');
});

test('readTenorConfig: reports missing api key', () => {
  const out = readTenorConfig({});
  assert.deepEqual(out, { error: 'missing_api_key' });
});

test('readTenorConfig: returns trimmed api key', () => {
  const out = readTenorConfig({ TENOR_API_KEY: '  abc-key  ' } as NodeJS.ProcessEnv);
  assert.deepEqual(out, { apiKey: 'abc-key' });
});

test('tenorSearch: clamps limit to [1, 50] and forwards client_key + media_filter', async () => {
  let capturedUrl = '';
  const fakeFetch: typeof fetch = async (url) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({ results: [], next: '' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  await tenorSearch(
    { apiKey: 'k', clientKey: 'cid', fetchFn: fakeFetch },
    { q: 'cats', limit: 9999 },
  );
  const u = new URL(capturedUrl);
  assert.equal(u.searchParams.get('limit'), '50');
  assert.equal(u.searchParams.get('client_key'), 'cid');
  assert.equal(u.searchParams.get('media_filter'), 'gif,tinygif');
  assert.equal(u.searchParams.get('contentfilter'), 'medium');

  await tenorSearch({ apiKey: 'k', fetchFn: fakeFetch }, { q: 'cats', limit: 0 });
  const u2 = new URL(capturedUrl);
  assert.equal(u2.searchParams.get('limit'), '1');
});
