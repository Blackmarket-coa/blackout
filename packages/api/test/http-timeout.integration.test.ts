import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, DEFAULT_FETCH_TIMEOUT_MS } from '../src/integrations/http';

// A fetch-like that never resolves on its own but honors the abort signal,
// mirroring how the real `fetch` rejects when its signal aborts. A ref'd
// keep-alive timer stands in for a real socket so the event loop stays alive
// until the abort fires (withTimeout's own timer is intentionally unref'd).
const hangingFetch: typeof fetch = ((_input: unknown, init?: { signal?: AbortSignal }) =>
  new Promise((_resolve, reject) => {
    const keepAlive = setInterval(() => {}, 1_000);
    const signal = init?.signal;
    if (!signal) return;
    signal.addEventListener('abort', () => {
      clearInterval(keepAlive);
      reject(signal.reason ?? new DOMException('aborted', 'AbortError'));
    });
  })) as unknown as typeof fetch;

test('withTimeout aborts a hung request with a TimeoutError', async () => {
  const wrapped = withTimeout(hangingFetch, 20);
  await assert.rejects(
    () => wrapped('https://example.test'),
    (err: unknown) => (err as DOMException).name === 'TimeoutError',
  );
});

test('withTimeout passes a fast response through unchanged', async () => {
  const okFetch: typeof fetch = (async () => new Response('ok')) as unknown as typeof fetch;
  const res = await withTimeout(okFetch, 1_000)('https://example.test');
  assert.equal(await res.text(), 'ok');
});

test('withTimeout leaves a caller-supplied signal untouched', async () => {
  let received: AbortSignal | undefined;
  const echoFetch: typeof fetch = (async (_i: unknown, init?: { signal?: AbortSignal }) => {
    received = init?.signal;
    return new Response('ok');
  }) as unknown as typeof fetch;

  const controller = new AbortController();
  await withTimeout(echoFetch, 20)('https://example.test', { signal: controller.signal });
  assert.equal(received, controller.signal, 'must not replace the provided signal');
});

test('DEFAULT_FETCH_TIMEOUT_MS is a sane bound', () => {
  assert.ok(DEFAULT_FETCH_TIMEOUT_MS > 0 && DEFAULT_FETCH_TIMEOUT_MS <= 30_000);
});
