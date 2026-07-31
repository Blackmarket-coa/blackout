import { createHmac, timingSafeEqual } from 'node:crypto';
import { log } from '../telemetry/logger';

export type BillingProvider = 'lago' | 'stripe';

export interface VerifyResult {
    ok: boolean;
    provider: BillingProvider;
    reason?:
        | 'signature-missing'
        | 'signature-mismatch'
        | 'signature-malformed'
        | 'timestamp-skew'
        | 'secret-not-configured-in-production';
    /** True when the verifier intentionally accepted an unsigned payload because
     *  no secret is configured in dev/test. Production builds never set this. */
    acceptedUnsignedDev?: boolean;
}

/** Maximum allowed clock skew between the signed timestamp and now, in seconds.
 *  Protects against replays of an old captured webhook. Stripe recommends 5m. */
const STRIPE_DEFAULT_SKEW_SECONDS = 60 * 5;

const safeEqualHex = (a: string, b: string): boolean => {
    const aBuf = Buffer.from(a, 'hex');
    const bBuf = Buffer.from(b, 'hex');
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
};

/**
 * Lago HMAC-SHA256 of the raw request body, hex-encoded, sent as the
 * `X-Lago-Signature` header. See the Lago docs:
 * https://docs.getlago.com/integrations/webhooks#signature-verification
 */
export const verifyLagoSignature = (
    rawBody: string,
    header: string | undefined,
    secret: string
): VerifyResult => {
    if (!header) return { ok: false, provider: 'lago', reason: 'signature-missing' };
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    // Lago has historically used either hex digest OR a JWT envelope. Accept hex
    // here; deployments using the JWT shape can layer their own verifier.
    const trimmed = header.trim();
    if (!/^[a-fA-F0-9]+$/.test(trimmed)) {
        return { ok: false, provider: 'lago', reason: 'signature-malformed' };
    }
    return safeEqualHex(trimmed, expected)
        ? { ok: true, provider: 'lago' }
        : { ok: false, provider: 'lago', reason: 'signature-mismatch' };
};

/**
 * Stripe's `Stripe-Signature: t=<unix>,v1=<hex>[,v0=<hex>]` envelope.
 * Signed payload is `${t}.${rawBody}`, HMAC-SHA256, hex-encoded. We accept
 * any v1 entry that matches and reject if the timestamp is skewed past
 * `skewSeconds` (replay protection).
 */
export const verifyStripeSignature = (
    rawBody: string,
    header: string | undefined,
    secret: string,
    options: { skewSeconds?: number; nowSeconds?: number } = {}
): VerifyResult => {
    if (!header) return { ok: false, provider: 'stripe', reason: 'signature-missing' };

    const parts = header.split(',').map((p) => p.trim());
    let timestamp: number | undefined;
    const v1Sigs: string[] = [];
    for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const key = part.slice(0, eq);
        const value = part.slice(eq + 1);
        if (key === 't') {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed)) timestamp = parsed;
        } else if (key === 'v1') {
            v1Sigs.push(value);
        }
    }
    if (timestamp === undefined || v1Sigs.length === 0) {
        return { ok: false, provider: 'stripe', reason: 'signature-malformed' };
    }

    const skew = options.skewSeconds ?? STRIPE_DEFAULT_SKEW_SECONDS;
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > skew) {
        return { ok: false, provider: 'stripe', reason: 'timestamp-skew' };
    }

    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    for (const sig of v1Sigs) {
        if (/^[a-fA-F0-9]+$/.test(sig) && safeEqualHex(sig, expected)) {
            return { ok: true, provider: 'stripe' };
        }
    }
    return { ok: false, provider: 'stripe', reason: 'signature-mismatch' };
};

const readSecret = (): { secret: string | undefined; provider: BillingProvider } => {
    const provider = (
        process.env.BILLING_WEBHOOK_PROVIDER ?? 'lago'
    ).toLowerCase() as BillingProvider;
    const secret =
        process.env.BILLING_WEBHOOK_SECRET ??
        (provider === 'stripe'
            ? process.env.STRIPE_WEBHOOK_SECRET
            : process.env.LAGO_WEBHOOK_SECRET);
    return { secret, provider };
};

const SIGNATURE_HEADERS: Record<BillingProvider, string> = {
    lago: 'x-lago-signature',
    stripe: 'stripe-signature',
};

/**
 * Env-driven dispatcher. Picks the provider via BILLING_WEBHOOK_PROVIDER and
 * the shared secret via BILLING_WEBHOOK_SECRET (or provider-specific aliases).
 *
 * Production semantics: when NODE_ENV=production and the secret is unset, the
 * call returns ok:false with reason `secret-not-configured-in-production` so
 * the route returns 401. In dev/test (no secret), it warns and accepts so
 * existing fixtures keep working.
 */
export const verifyBillingWebhook = (
    rawBody: string,
    headers: Record<string, string | undefined>
): VerifyResult => {
    const { provider, secret } = readSecret();
    const headerName = SIGNATURE_HEADERS[provider];
    const headerValue = headers[headerName];

    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            return { ok: false, provider, reason: 'secret-not-configured-in-production' };
        }
        log.warn('billing_webhook_unsigned_dev_accept', { provider });
        return { ok: true, provider, acceptedUnsignedDev: true };
    }

    return provider === 'stripe'
        ? verifyStripeSignature(rawBody, headerValue, secret)
        : verifyLagoSignature(rawBody, headerValue, secret);
};

/**
 * Stripe webhook verification pinned to `STRIPE_WEBHOOK_SECRET`, independent of
 * the `BILLING_WEBHOOK_PROVIDER` dispatcher above. Used by the dedicated Stripe
 * checkout webhook (`checkout.session.completed` → `cus_…` sync), which is a
 * separate concern from the recurring billing-events webhook. Same dev/prod
 * secret semantics as `verifyBillingWebhook`.
 */
export const verifyStripeWebhook = (
    rawBody: string,
    headers: Record<string, string | undefined>
): VerifyResult => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? process.env.BILLING_WEBHOOK_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            return { ok: false, provider: 'stripe', reason: 'secret-not-configured-in-production' };
        }
        log.warn('stripe_webhook_unsigned_dev_accept', { provider: 'stripe' });
        return { ok: true, provider: 'stripe', acceptedUnsignedDev: true };
    }
    return verifyStripeSignature(rawBody, headers[SIGNATURE_HEADERS.stripe], secret);
};

export const __test__ = { SIGNATURE_HEADERS };
