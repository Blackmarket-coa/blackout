/**
 * Wrap a fetch-like with a per-request timeout.
 *
 * Node's global `fetch` has no request timeout, so a slow or half-open
 * upstream would otherwise hang the caller indefinitely — which for the chat
 * bridges means a stalled poll worker or a wedged message-forwarding path.
 *
 * The abort timer is unref'd (it never keeps the process alive) and cleared
 * as soon as the response settles, so wrapping a fast/stubbed fetch leaves no
 * lingering timer. A caller-supplied `signal` is respected and left untouched.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export const withTimeout = (
  fetchFn: typeof fetch,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): typeof fetch =>
  (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (init?.signal) return fetchFn(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException(`request timed out after ${timeoutMs}ms`, 'TimeoutError'));
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    try {
      return await fetchFn(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }) as typeof fetch;
