import test from 'node:test';
import assert from 'node:assert/strict';

const { createFailoverMailer, __test__ } = await import('../src/integrations/failoverMailer');
const { FailoverMailer } = __test__;

interface ScriptedResult {
  reject?: Error;
}

const makeMailerSpy = (responses: ScriptedResult[]) => {
  const calls: Array<Record<string, unknown>> = [];
  const send = async (message: Record<string, unknown>) => {
    calls.push(message);
    const next = responses.shift();
    if (!next) throw new Error('test mailer ran out of scripted responses');
    if (next.reject) throw next.reject;
  };
  return { calls, mailer: { send } };
};

const message = (kind = 'test') => ({
  to: 'alice@example.com',
  subject: 'Hi',
  text: 'Body',
  kind,
});

test('failover starts closed and routes through primary on success', async () => {
  const primary = makeMailerSpy([{}]);
  const fallback = makeMailerSpy([]);
  const mailer = new FailoverMailer({
    primary: primary.mailer,
    fallback: fallback.mailer,
    primaryName: 'resend',
    fallbackName: 'smtp',
  });
  await mailer.send(message());
  assert.equal(primary.calls.length, 1);
  assert.equal(fallback.calls.length, 0);
  assert.equal(mailer.__peek().state, 'closed');
});

test('failover opens after threshold consecutive failures and routes through fallback', async () => {
  const transient = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
  const primary = makeMailerSpy([
    { reject: transient },
    { reject: transient },
    { reject: transient },
  ]);
  const fallback = makeMailerSpy([{}, {}, {}, {}]);
  const mailer = new FailoverMailer({
    primary: primary.mailer,
    fallback: fallback.mailer,
    primaryName: 'resend',
    fallbackName: 'smtp',
    failureThreshold: 3,
    cooldownMs: 60_000,
  });

  // Three failing sends: each falls back, and the 3rd trip opens the breaker.
  await mailer.send(message());
  await mailer.send(message());
  await mailer.send(message());
  assert.equal(primary.calls.length, 3);
  assert.equal(fallback.calls.length, 3);
  assert.equal(mailer.__peek().state, 'open');

  // 4th send while open: primary not called at all, fallback handles it.
  await mailer.send(message());
  assert.equal(primary.calls.length, 3);
  assert.equal(fallback.calls.length, 4);
});

test('failover half-open probe closes the breaker on success', async () => {
  let now = 1_000_000;
  const transient = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
  const primary = makeMailerSpy([{ reject: transient }, { reject: transient }, {}]);
  const fallback = makeMailerSpy([{}, {}]);
  const mailer = new FailoverMailer({
    primary: primary.mailer,
    fallback: fallback.mailer,
    primaryName: 'resend',
    fallbackName: 'smtp',
    failureThreshold: 2,
    cooldownMs: 1000,
    now: () => now,
  });

  await mailer.send(message());
  await mailer.send(message());
  assert.equal(mailer.__peek().state, 'open');

  // Advance past the cooldown — next send should half-open + probe primary.
  now += 1500;
  await mailer.send(message());
  assert.equal(primary.calls.length, 3);
  assert.equal(mailer.__peek().state, 'closed');
});

test('failover half-open probe failure re-opens the breaker and restarts the cooldown', async () => {
  let now = 1_000_000;
  const transient = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
  const primary = makeMailerSpy([
    { reject: transient },
    { reject: transient },
    { reject: transient },
  ]);
  const fallback = makeMailerSpy([{}, {}, {}]);
  const mailer = new FailoverMailer({
    primary: primary.mailer,
    fallback: fallback.mailer,
    primaryName: 'resend',
    fallbackName: 'smtp',
    failureThreshold: 2,
    cooldownMs: 1000,
    now: () => now,
  });

  await mailer.send(message()); // primary fail 1
  await mailer.send(message()); // primary fail 2 → open
  const firstOpenUntil = mailer.__peek().openUntilMs;

  // Half-open probe fails — breaker re-opens with fresh cooldown.
  now += 1500;
  await mailer.send(message()); // half-open probe fails → fallback handles
  assert.equal(mailer.__peek().state, 'open');
  assert.ok(mailer.__peek().openUntilMs > firstOpenUntil);
  assert.equal(primary.calls.length, 3);
  assert.equal(fallback.calls.length, 3);
});

test('failover throws if both primary and fallback fail; original error attached as cause', async () => {
  const primaryErr = Object.assign(new Error('primary down'), { code: 'ECONNRESET' });
  const fallbackErr = Object.assign(new Error('fallback also down'), { code: 'ECONNREFUSED' });
  const primary = makeMailerSpy([{ reject: primaryErr }]);
  const fallback = makeMailerSpy([{ reject: fallbackErr }]);
  const mailer = new FailoverMailer({
    primary: primary.mailer,
    fallback: fallback.mailer,
    primaryName: 'resend',
    fallbackName: 'smtp',
  });

  await assert.rejects(() => mailer.send(message()), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match((err as Error).message, /fallback also down/);
    const cause = (err as Error & { cause?: unknown }).cause;
    assert.ok(cause instanceof Error);
    assert.match((cause as Error).message, /primary down/);
    return true;
  });
});

test('failover primary success resets the consecutive-failure counter', async () => {
  const transient = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
  // Pattern: fail, fail, success, fail, fail — should never trip with threshold 3.
  const primary = makeMailerSpy([
    { reject: transient },
    { reject: transient },
    {},
    { reject: transient },
    { reject: transient },
  ]);
  const fallback = makeMailerSpy([{}, {}, {}, {}]);
  const mailer = new FailoverMailer({
    primary: primary.mailer,
    fallback: fallback.mailer,
    primaryName: 'resend',
    fallbackName: 'smtp',
    failureThreshold: 3,
    cooldownMs: 60_000,
  });

  for (let i = 0; i < 5; i += 1) {
    await mailer.send(message());
  }
  assert.equal(mailer.__peek().state, 'closed');
  assert.equal(mailer.__peek().consecutiveFailures, 2);
});

test('createFailoverMailer returns a Mailer (factory smoke test)', () => {
  const primary = makeMailerSpy([]);
  const fallback = makeMailerSpy([]);
  const mailer = createFailoverMailer({
    primary: primary.mailer,
    fallback: fallback.mailer,
    primaryName: 'p',
    fallbackName: 'f',
  });
  assert.equal(typeof mailer.send, 'function');
});
