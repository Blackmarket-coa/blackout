import test from 'node:test';
import assert from 'node:assert/strict';

const { createResendMailer } = await import('../src/integrations/resend');

const makeFetchSpy = (
  responses: Array<{ status: number; body?: string }>,
) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('test fetch ran out of scripted responses');
    return new Response(next.body ?? '', { status: next.status });
  };
  return { calls, fetchImpl };
};

test('resend mailer succeeds on first attempt and posts the expected payload', async () => {
  const { calls, fetchImpl } = makeFetchSpy([{ status: 200, body: '{"id":"abc"}' }]);
  const mailer = createResendMailer({
    apiKey: 'test-key',
    from: 'Blackout <noreply@blackout.test>',
    apiUrl: 'https://example.com/emails',
    fetchImpl,
  });
  await mailer.send({
    to: 'alice@example.com',
    subject: 'Hi',
    text: 'Body',
    kind: 'email_verification',
  });
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0]!.init.body as string);
  assert.equal(body.from, 'Blackout <noreply@blackout.test>');
  assert.deepEqual(body.to, ['alice@example.com']);
  assert.equal(body.subject, 'Hi');
  assert.deepEqual(body.tags, [{ name: 'kind', value: 'email_verification' }]);
});

test('resend mailer retries transient 5xx and then succeeds', async () => {
  const { calls, fetchImpl } = makeFetchSpy([
    { status: 502 },
    { status: 503 },
    { status: 200, body: '{"id":"ok"}' },
  ]);
  const mailer = createResendMailer({
    apiKey: 'k',
    from: 'from@x',
    apiUrl: 'https://example.com/emails',
    fetchImpl,
    initialBackoffMs: 1,
    maxBackoffMs: 1,
    maxAttempts: 3,
  });
  await mailer.send({ to: 'a@b', subject: 's', text: 't' });
  assert.equal(calls.length, 3);
});

test('resend mailer does not retry 4xx and surfaces the failure', async () => {
  const { calls, fetchImpl } = makeFetchSpy([
    { status: 400, body: '{"error":"bad request"}' },
  ]);
  const mailer = createResendMailer({
    apiKey: 'k',
    from: 'from@x',
    apiUrl: 'https://example.com/emails',
    fetchImpl,
    initialBackoffMs: 1,
    maxBackoffMs: 1,
  });
  await assert.rejects(
    () => mailer.send({ to: 'a@b', subject: 's', text: 't' }),
    /resend send failed: 400/,
  );
  assert.equal(calls.length, 1);
});

test('resend mailer exhausts retries and throws after max attempts', async () => {
  const { calls, fetchImpl } = makeFetchSpy([
    { status: 503 },
    { status: 503 },
    { status: 503 },
  ]);
  const mailer = createResendMailer({
    apiKey: 'k',
    from: 'from@x',
    apiUrl: 'https://example.com/emails',
    fetchImpl,
    initialBackoffMs: 1,
    maxBackoffMs: 1,
    maxAttempts: 3,
  });
  await assert.rejects(() => mailer.send({ to: 'a@b', subject: 's', text: 't' }));
  assert.equal(calls.length, 3);
});
