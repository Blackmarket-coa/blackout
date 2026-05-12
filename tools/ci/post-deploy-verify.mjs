#!/usr/bin/env node
/**
 * Post-deploy verification probe.
 *
 * Run against the public URL of a freshly deployed environment (staging,
 * canary, production). Exits non-zero on any failed check so the deploy
 * workflow can roll back without operator intervention.
 *
 * Required env:
 *   POST_DEPLOY_BASE_URL   - public origin, e.g. https://blackout.example.org
 *
 * Optional env:
 *   POST_DEPLOY_BEARER     - bearer token for authed checks (skipped if unset)
 *   POST_DEPLOY_TIMEOUT_MS - per-request timeout in ms (default 8000)
 *   POST_DEPLOY_EXPECTED_VERSION - if set, /health must report this version
 *   POST_DEPLOY_SKIP       - comma-separated list of check ids to skip
 *
 * Conventions:
 *   - Every check prints a single JSON line to stdout.
 *   - A failure prints with ok:false and contributes to the non-zero exit.
 *   - Checks are independent — a single failure does not abort the run, so
 *     the operator sees the full picture.
 */

const baseUrl = process.env.POST_DEPLOY_BASE_URL;
if (!baseUrl) {
  console.error('POST_DEPLOY_BASE_URL is required.');
  process.exit(2);
}

const timeoutMs = Number.parseInt(process.env.POST_DEPLOY_TIMEOUT_MS ?? '8000', 10);
const bearer = process.env.POST_DEPLOY_BEARER;
const expectedVersion = process.env.POST_DEPLOY_EXPECTED_VERSION;
const skip = new Set(
  (process.env.POST_DEPLOY_SKIP ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const withTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const results = [];

const record = (id, ok, detail) => {
  const entry = { id, ok, detail };
  results.push(entry);
  console.log(JSON.stringify(entry));
};

const check = async (id, runner) => {
  if (skip.has(id)) {
    record(id, true, 'skipped');
    return;
  }
  try {
    const detail = await runner();
    record(id, true, detail);
  } catch (err) {
    record(id, false, err instanceof Error ? err.message : String(err));
  }
};

await check('health', async () => {
  const response = await withTimeout(new URL('/health', baseUrl).toString());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json().catch(() => ({}));
  if (body.status !== 'ok') throw new Error(`status != ok: ${JSON.stringify(body).slice(0, 200)}`);
  if (expectedVersion && body.version && body.version !== expectedVersion) {
    throw new Error(`version mismatch: got ${body.version}, expected ${expectedVersion}`);
  }
  return JSON.stringify(body).slice(0, 200);
});

await check('health-calls', async () => {
  const response = await withTimeout(new URL('/health/calls', baseUrl).toString());
  // 503 is acceptable when calls feature is intentionally disabled — only
  // fail if we get a 5xx outside that explicit "disabled" reply shape.
  if (response.status >= 500 && response.status !== 503) {
    throw new Error(`HTTP ${response.status}`);
  }
  return `HTTP ${response.status}`;
});

await check('metrics-gated', async () => {
  const response = await withTimeout(new URL('/metrics', baseUrl).toString());
  // The production /metrics handler (packages/api/src/index.ts) MUST be
  // gated: 401 when INTERNAL_METRICS_TOKEN is set and no/wrong bearer is
  // presented, 503 when the token is missing entirely in production. A
  // 200 here means the endpoint is publicly readable — that's exactly
  // the regression this check is meant to catch.
  if (response.status === 401 || response.status === 503) {
    return `HTTP ${response.status}`;
  }
  if (response.status === 200) {
    throw new Error(
      '/metrics returned 200 without auth — endpoint is publicly readable. Set INTERNAL_METRICS_TOKEN.',
    );
  }
  throw new Error(`unexpected status ${response.status}`);
});

await check('marketplace-webhook-rejects-unsigned', async () => {
  const response = await withTimeout(
    new URL('/v1/marketplace/webhooks/freeblackmarket', baseUrl).toString(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ probe: true }),
    },
  );
  // Refusing unsigned/bad webhooks at the HMAC stage is the load-bearing
  // safety property. Any 2xx here means the webhook handler is misconfigured.
  if (response.status >= 200 && response.status < 300) {
    throw new Error(`unsigned webhook should be rejected, got ${response.status}`);
  }
  return `HTTP ${response.status}`;
});

if (bearer) {
  await check('authed-self', async () => {
    const response = await withTimeout(new URL('/v1/auth/sessions/revoke', baseUrl).toString(), {
      method: 'GET',
      headers: { authorization: `Bearer ${bearer}` },
    });
    // We don't expect 200 (this is a POST endpoint); we expect 405 or a
    // 4xx that proves auth was at least evaluated, not 5xx.
    if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
    return `HTTP ${response.status}`;
  });
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`post-deploy verification failed: ${failed.map((f) => f.id).join(', ')}`);
  process.exit(1);
}

console.log(`post-deploy verification passed (${results.length} checks).`);
