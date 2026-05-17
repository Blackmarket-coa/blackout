import test from 'node:test';
import assert from 'node:assert/strict';

const { createSmtpMailer, __test__ } = await import('../src/integrations/smtp');

interface ScriptedSendMail {
  reject?: Error;
}

const makeSendMailSpy = (responses: ScriptedSendMail[]) => {
  const calls: Array<Record<string, unknown>> = [];
  const sendMail = async (message: Record<string, unknown>) => {
    calls.push(message);
    const next = responses.shift();
    if (!next) throw new Error('test sendMail ran out of scripted responses');
    if (next.reject) throw next.reject;
    return { accepted: [message.to], rejected: [] };
  };
  return { calls, transport: { sendMail } };
};

test('smtp mailer sends with the configured from + adds x-blackout-kind header', async () => {
  const { calls, transport } = makeSendMailSpy([{}]);
  const mailer = createSmtpMailer({
    host: 'smtp.example.com',
    from: 'Blackout <noreply@blackout.test>',
    transport,
  });
  await mailer.send({
    to: 'alice@example.com',
    subject: 'Hi',
    text: 'Body',
    kind: 'email_verification',
  });
  assert.equal(calls.length, 1);
  const sent = calls[0]!;
  assert.equal(sent.from, 'Blackout <noreply@blackout.test>');
  assert.equal(sent.to, 'alice@example.com');
  assert.equal(sent.subject, 'Hi');
  assert.deepEqual(sent.headers, { 'x-blackout-kind': 'email_verification' });
});

test('smtp mailer retries on a transient error and succeeds on the second attempt', async () => {
  const transientErr = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
  const { calls, transport } = makeSendMailSpy([{ reject: transientErr }, {}]);
  const mailer = createSmtpMailer({
    host: 'smtp.example.com',
    from: 'noreply@blackout.test',
    transport,
    initialBackoffMs: 1,
    maxBackoffMs: 2,
  });
  await mailer.send({ to: 'alice@example.com', subject: 'Hi', text: 'Body' });
  assert.equal(calls.length, 2);
});

test('smtp mailer fails fast on a 5xx permanent error without retrying', async () => {
  const permanentErr = Object.assign(new Error('mailbox refused'), { responseCode: 550 });
  const { calls, transport } = makeSendMailSpy([{ reject: permanentErr }]);
  const mailer = createSmtpMailer({
    host: 'smtp.example.com',
    from: 'noreply@blackout.test',
    transport,
    initialBackoffMs: 1,
    maxBackoffMs: 2,
  });
  await assert.rejects(
    () => mailer.send({ to: 'alice@example.com', subject: 'Hi', text: 'Body' }),
    /mailbox refused/,
  );
  assert.equal(calls.length, 1);
});

test('smtp mailer exhausts retries on persistent transient errors and throws', async () => {
  const transientErr = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
  const { calls, transport } = makeSendMailSpy([
    { reject: transientErr },
    { reject: transientErr },
    { reject: transientErr },
  ]);
  const mailer = createSmtpMailer({
    host: 'smtp.example.com',
    from: 'noreply@blackout.test',
    transport,
    initialBackoffMs: 1,
    maxBackoffMs: 2,
  });
  await assert.rejects(
    () => mailer.send({ to: 'alice@example.com', subject: 'Hi', text: 'Body' }),
    /timeout/,
  );
  assert.equal(calls.length, 3);
});

test('isPermanentError catches EAUTH + 5xx + EENVELOPE; treats 4xx + ECONNRESET as transient', () => {
  const { isPermanentError } = __test__;
  assert.equal(isPermanentError(Object.assign(new Error('x'), { responseCode: 550 })), true);
  assert.equal(isPermanentError(Object.assign(new Error('x'), { code: 'EAUTH' })), true);
  assert.equal(isPermanentError(Object.assign(new Error('x'), { code: 'EENVELOPE' })), true);
  assert.equal(isPermanentError(Object.assign(new Error('x'), { responseCode: 421 })), false);
  assert.equal(isPermanentError(Object.assign(new Error('x'), { code: 'ECONNRESET' })), false);
});
