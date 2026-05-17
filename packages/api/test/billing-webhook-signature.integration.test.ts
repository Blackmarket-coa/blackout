import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.NODE_ENV = 'test';

const loadVerifier = async () => {
  const mod = await import('../src/services/billingWebhookSignature');
  return mod;
};

test('verifyLagoSignature accepts a valid hex HMAC and rejects a bad one', async () => {
  const { verifyLagoSignature } = await loadVerifier();
  const secret = 'lago-shared-secret';
  const body = JSON.stringify({ eventId: 'evt_1', type: 'invoice.paid', userId: 'u1' });
  const valid = createHmac('sha256', secret).update(body).digest('hex');

  assert.equal(verifyLagoSignature(body, valid, secret).ok, true);
  assert.equal(verifyLagoSignature(body, valid + '00', secret).ok, false);
  assert.equal(verifyLagoSignature(body, undefined, secret).reason, 'signature-missing');
  assert.equal(verifyLagoSignature(body, 'not-hex!!!', secret).reason, 'signature-malformed');
});

test('verifyStripeSignature parses t= and v1=, enforces skew, and validates HMAC', async () => {
  const { verifyStripeSignature } = await loadVerifier();
  const secret = 'whsec_test';
  const body = JSON.stringify({ id: 'evt_xyz', type: 'invoice.paid' });
  const ts = 1_700_000_000;
  const expected = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

  const okHeader = `t=${ts},v1=${expected}`;
  assert.equal(
    verifyStripeSignature(body, okHeader, secret, { nowSeconds: ts }).ok,
    true,
  );

  // Skew rejection.
  assert.equal(
    verifyStripeSignature(body, okHeader, secret, { nowSeconds: ts + 999_999 }).reason,
    'timestamp-skew',
  );

  // Tampered body.
  assert.equal(
    verifyStripeSignature(body + 'x', okHeader, secret, { nowSeconds: ts }).reason,
    'signature-mismatch',
  );

  // Missing components.
  assert.equal(
    verifyStripeSignature(body, `t=${ts}`, secret, { nowSeconds: ts }).reason,
    'signature-malformed',
  );
  assert.equal(
    verifyStripeSignature(body, undefined, secret).reason,
    'signature-missing',
  );

  // Multiple v1 entries: only one needs to match (tolerates Stripe's signing-secret rotation).
  const headerWithTwo = `t=${ts},v1=00deadbeef,v1=${expected}`;
  assert.equal(
    verifyStripeSignature(body, headerWithTwo, secret, { nowSeconds: ts }).ok,
    true,
  );
});

test('verifyBillingWebhook accepts unsigned payloads in dev/test but rejects in production', async () => {
  const { verifyBillingWebhook } = await loadVerifier();
  const body = '{"hi":1}';

  // Dev/test, no secret → accepted with acceptedUnsignedDev flag.
  delete process.env.BILLING_WEBHOOK_SECRET;
  delete process.env.LAGO_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  process.env.NODE_ENV = 'test';
  const dev = verifyBillingWebhook(body, {});
  assert.equal(dev.ok, true);
  assert.equal(dev.acceptedUnsignedDev, true);

  // Production, no secret → rejected.
  process.env.NODE_ENV = 'production';
  const prod = verifyBillingWebhook(body, {});
  assert.equal(prod.ok, false);
  assert.equal(prod.reason, 'secret-not-configured-in-production');

  // Restore.
  process.env.NODE_ENV = 'test';
});

test('verifyBillingWebhook routes the right header per provider', async () => {
  const { verifyBillingWebhook } = await loadVerifier();
  const body = '{"id":"evt"}';

  process.env.BILLING_WEBHOOK_PROVIDER = 'lago';
  process.env.BILLING_WEBHOOK_SECRET = 'lago-secret';
  const lagoSig = createHmac('sha256', 'lago-secret').update(body).digest('hex');
  assert.equal(verifyBillingWebhook(body, { 'x-lago-signature': lagoSig }).ok, true);
  assert.equal(verifyBillingWebhook(body, { 'stripe-signature': lagoSig }).ok, false);

  process.env.BILLING_WEBHOOK_PROVIDER = 'stripe';
  process.env.BILLING_WEBHOOK_SECRET = 'stripe-secret';
  const ts = Math.floor(Date.now() / 1000);
  const stripeSig = createHmac('sha256', 'stripe-secret').update(`${ts}.${body}`).digest('hex');
  assert.equal(
    verifyBillingWebhook(body, { 'stripe-signature': `t=${ts},v1=${stripeSig}` }).ok,
    true,
  );

  // Cleanup so subsequent tests in this file see test-mode defaults.
  delete process.env.BILLING_WEBHOOK_PROVIDER;
  delete process.env.BILLING_WEBHOOK_SECRET;
});
