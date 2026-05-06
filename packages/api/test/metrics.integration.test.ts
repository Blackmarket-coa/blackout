import test from 'node:test';
import assert from 'node:assert/strict';

const loadMetrics = async () => import('../src/telemetry/metrics');

test('counter exposes labelled and unlabelled samples', async () => {
  const m = await loadMetrics();
  // Use a unique instrument name per test so module-level instruments do not
  // collide with the registry — the registry rejects duplicate registrations.
  const counter = new m.Counter('unit_test_counter_a', 'Test counter', ['kind']);
  counter.inc({ kind: 'apple' });
  counter.inc({ kind: 'apple' }, 4);
  counter.inc({ kind: 'orange' });

  const text = m.registry.expose();
  assert.match(text, /# TYPE unit_test_counter_a counter/);
  assert.match(text, /unit_test_counter_a\{kind="apple"\} 5/);
  assert.match(text, /unit_test_counter_a\{kind="orange"\} 1/);
});

test('counter with no label names emits a zero baseline', async () => {
  const m = await loadMetrics();
  const counter = new m.Counter('unit_test_counter_zero', 'Empty counter');
  const text = m.registry.expose();
  assert.match(text, /unit_test_counter_zero 0/);
  counter.inc();
  // The zero-baseline only appears when there are no series; once we record,
  // re-export should reflect the recorded value.
  const text2 = m.registry.expose();
  assert.match(text2, /unit_test_counter_zero 1/);
});

test('histogram emits cumulative buckets, sum, and count', async () => {
  const m = await loadMetrics();
  const h = new m.Histogram('unit_test_hist', 'Test latencies', [0.1, 0.5, 1], ['route']);
  h.observe(0.05, { route: '/x' });
  h.observe(0.3, { route: '/x' });
  h.observe(2, { route: '/x' });

  const text = m.registry.expose();
  assert.match(text, /unit_test_hist_bucket\{le="0.1",route="\/x"\} 1/);
  assert.match(text, /unit_test_hist_bucket\{le="0.5",route="\/x"\} 2/);
  assert.match(text, /unit_test_hist_bucket\{le="1",route="\/x"\} 2/);
  assert.match(text, /unit_test_hist_bucket\{le="\+Inf",route="\/x"\} 3/);
  assert.match(text, /unit_test_hist_count\{route="\/x"\} 3/);
  // sum is approximately 0.05 + 0.3 + 2 = 2.35
  const sumMatch = /unit_test_hist_sum\{route="\/x"\} ([0-9.]+)/.exec(text);
  assert.ok(sumMatch);
  assert.ok(Math.abs(Number.parseFloat(sumMatch![1]) - 2.35) < 1e-9);
});

test('registry rejects duplicate instrument names', async () => {
  const m = await loadMetrics();
  new m.Counter('dup_counter', 'first');
  assert.throws(() => new m.Counter('dup_counter', 'second'), /registered twice/);
});

test('label values escape special characters', async () => {
  const m = await loadMetrics();
  const counter = new m.Counter('unit_test_escape', 'Escapes', ['raw']);
  counter.inc({ raw: 'with "quote" and \\ slash' });
  const text = m.registry.expose();
  assert.match(text, /raw="with \\"quote\\" and \\\\ slash"/);
});

test('default instruments are all registered and exposable', async () => {
  const m = await loadMetrics();
  // Touching the module-level instruments should not throw, and they appear
  // in the exposition text.
  const text = m.registry.expose();
  assert.match(text, /# TYPE http_request_duration_seconds histogram/);
  assert.match(text, /# TYPE http_requests_total counter/);
  assert.match(text, /# TYPE auth_failures_total counter/);
  assert.match(text, /# TYPE rate_limit_hits_total counter/);
  assert.match(text, /# TYPE refresh_token_reuses_total counter/);
});
