/**
 * Real Stripe Checkout + Billing Portal via the Stripe REST API.
 *
 * Kept dependency-free (no `stripe` SDK) — the Stripe API is a plain
 * form-encoded HTTPS POST, so a `fetch` is enough and avoids pulling a large
 * dependency into the API bundle. This path is used ONLY when `STRIPE_SECRET_KEY`
 * is configured; otherwise callers fall back to the deterministic mock URLs used
 * in dev/test, so nothing changes for local development.
 *
 * Price ids are resolved per plan from the environment
 * (`STRIPE_PRICE_<PLAN_CODE_UPPER>`), so the plan catalog stays in code while the
 * concrete Stripe prices live in deploy config.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

export class StripeApiError extends Error {
    constructor(readonly status: number, readonly detail: string) {
        super(`Stripe API error ${status}: ${detail}`);
        this.name = 'StripeApiError';
    }
}

type Env = Record<string, string | undefined>;

/** Whether real Stripe is configured. When false, callers use mock URLs. */
export function stripeLiveEnabled(env: Env = process.env): boolean {
    return typeof env.STRIPE_SECRET_KEY === 'string' && env.STRIPE_SECRET_KEY.length > 0;
}

/**
 * Resolve the Stripe Price id configured for a plan code, if any. Convention:
 * `STRIPE_PRICE_<PLAN_CODE_UPPER>` — e.g. plan `canopy_pro_monthly` →
 * `STRIPE_PRICE_CANOPY_PRO_MONTHLY`.
 */
export function stripePriceIdForPlan(planCode: string, env: Env = process.env): string | undefined {
    const value = env[`STRIPE_PRICE_${planCode.toUpperCase()}`];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function stripePost(
    path: string,
    form: Record<string, string>,
    env: Env
): Promise<Record<string, unknown>> {
    const body = new URLSearchParams(form);
    const res = await fetch(`${STRIPE_API}${path}`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${env.STRIPE_SECRET_KEY ?? ''}`,
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new StripeApiError(res.status, detail.slice(0, 500));
    }
    return (await res.json()) as Record<string, unknown>;
}

/**
 * Create a real Stripe Checkout Session for a subscription. We pass
 * `client_reference_id` (the Blackout user id) rather than a fabricated
 * customer id so Stripe creates/collects the real customer; the
 * `checkout.session.completed` webhook is where the real `cus_…` gets synced
 * back onto the subscription record.
 */
export async function createStripeCheckoutSession(
    args: {
        priceId: string;
        clientReferenceId: string;
        successUrl: string;
        cancelUrl: string;
        trialDays?: number;
        customerEmail?: string;
    },
    env: Env = process.env
): Promise<{ id: string; url: string }> {
    const form: Record<string, string> = {
        mode: 'subscription',
        'line_items[0][price]': args.priceId,
        'line_items[0][quantity]': '1',
        client_reference_id: args.clientReferenceId,
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
    };
    if (args.trialDays && args.trialDays > 0) {
        form['subscription_data[trial_period_days]'] = String(args.trialDays);
    }
    if (args.customerEmail) form.customer_email = args.customerEmail;

    const data = await stripePost('/checkout/sessions', form, env);
    const id = typeof data.id === 'string' ? data.id : '';
    const url = typeof data.url === 'string' ? data.url : '';
    if (!id || !url) throw new StripeApiError(502, 'checkout session missing id/url');
    return { id, url };
}

/** Create a real Stripe Billing Portal session. Requires a real `cus_…` id. */
export async function createStripePortalSession(
    args: { customerId: string; returnUrl?: string },
    env: Env = process.env
): Promise<{ url: string }> {
    const form: Record<string, string> = { customer: args.customerId };
    if (args.returnUrl) form.return_url = args.returnUrl;
    const data = await stripePost('/billing_portal/sessions', form, env);
    const url = typeof data.url === 'string' ? data.url : '';
    if (!url) throw new StripeApiError(502, 'portal session missing url');
    return { url };
}
