// Synthetic client addresses for the load scripts.
//
// The API rate-limits per client address (packages/api/src/middleware/rate-limit.ts):
// 120 req/min on every route and 10 req/min on the auth routes, keyed on the
// right-most X-Forwarded-For entry — the hop the trusted reverse proxy appends
// (TRUSTED_PROXY_HOPS, default 1). In the nightly job k6 talks to the API
// directly, so it stands in for that proxy. Without an address every VU lands
// in the one "local" bucket, and the run measures the limiter turning away a
// single client sending hundreds of requests a second (correctly: 429) rather
// than the API serving that many users.
//
// One address per (VU, iteration), from 198.18.0.0/15 (RFC 2544, reserved for
// network benchmarking). Each VU cycles through 256 of them, so an address
// recurs only every 256 iterations of its VU, well inside both budgets at the
// pacing these scripts use.
//
// Against a deployment behind a real proxy the synthetic address is never used,
// as it should be: the proxy appends (or substitutes) the load generator's own
// address, so all traffic shares one bucket and these scripts will be
// rate-limited there.
export function clientAddress() {
    // __VU is 0 in setup()/teardown(), where __ITER is not defined at all.
    const iter = typeof __ITER === 'number' ? __ITER : 0;
    const n = (__VU % 512) * 256 + (iter % 256); // 0 .. 2^17 - 1
    return `198.${18 + (n >> 16)}.${(n >> 8) & 255}.${n & 255}`;
}
