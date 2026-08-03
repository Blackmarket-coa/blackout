/**
 * Monetization go-live preflight — verifies the flip described in
 * docs/operations/MONETIZATION_GO_LIVE.md before (and after) an operator
 * performs it. Two modes, combinable:
 *
 *   Env mode (default): validates the CURRENT process environment the way the
 *   API's own boot guards will (`assertFreeblackmarketSecretsForProduction`,
 *   `assertPlaceholderMarketplacesDisabledForProduction`), plus the Stripe and
 *   beta-unlock keys the runbook names. Run it in the API's deploy environment:
 *       pnpm preflight:monetization
 *
 *   HTTP mode (--base-url): probes a RUNNING stack read-only — catalog serves
 *   real (non-stub) rows with feature keys, the seller surface is live, and the
 *   FBM webhook rejects unsigned payloads:
 *       pnpm preflight:monetization -- --base-url https://api.theblackout.app
 *
 *   --charge: strict mode for the final "charge for real" flip (Step 5) —
 *   beta-unlock must be off and stub data becomes a failure, not a warning.
 *
 * Exit code is non-zero when any FAIL finding is present. WARNs never fail the
 * run; they mark steps that are optional or intentionally deferred.
 *
 * This tool checks configuration and wiring only. The legal/compliance gate
 * (ToS/privacy/refund pages, seller KYC/1099, prohibited-items policy — see
 * MARKETPLACE_AUDIT.md §9) cannot be machine-checked and still requires an
 * explicit human sign-off.
 */
import { pathToFileURL } from 'node:url';

const PLACEHOLDER_KEYS = ['BLAMAZON_ENABLED', 'MAYHEM_MARKETPLAZE_ENABLED', 'ANTIN_AMAZON_ENABLED'];

// The first-party package-subscription price ids the runbook (Step 3) names.
// Only the plans actually sold need ids, so absence is a warning, not a failure.
const RUNBOOK_STRIPE_PRICE_KEYS = [
    'STRIPE_PRICE_CANOPY_SPROUT_MONTHLY',
    'STRIPE_PRICE_CANOPY_SPROUT_ANNUAL',
    'STRIPE_PRICE_CANOPY_PRO_MONTHLY',
    'STRIPE_PRICE_CANOPY_PRO_ANNUAL',
];

const truthy = (value) => value === '1' || (value ?? '').toLowerCase() === 'true';

const finding = (level, check, detail) => ({ level, check, detail });
const pass = (check, detail) => finding('PASS', check, detail);
const warn = (check, detail) => finding('WARN', check, detail);
const fail = (check, detail) => finding('FAIL', check, detail);

/**
 * Env-mode checks. Pure: reads only the env object passed in.
 * Mirrors the API's production boot guards so a config that would crash (or
 * silently demo-data) the deploy is caught before the deploy.
 */
export function evaluateEnv(env, { charge = false } = {}) {
    const findings = [];

    if (env.NODE_ENV !== 'production') {
        findings.push(
            warn(
                'node-env',
                `NODE_ENV=${
                    env.NODE_ENV ?? '(unset)'
                } — the API's boot guards only enforce secrets in production; this preflight applies them anyway.`
            )
        );
    }

    // Step 2 — FBM provider secrets (mirrors assertFreeblackmarketSecretsForProduction).
    const fbmEnabled =
        env.FREEBLACKMARKET_ENABLED === undefined || truthy(env.FREEBLACKMARKET_ENABLED);
    if (!fbmEnabled) {
        findings.push(
            warn(
                'fbm-enabled',
                'FREEBLACKMARKET_ENABLED is off — the marketplace is opted out; going live requires it on with both secrets.'
            )
        );
    } else {
        findings.push(
            env.FREEBLACKMARKET_API_KEY
                ? pass('fbm-api-key', 'FREEBLACKMARKET_API_KEY is set.')
                : fail(
                      'fbm-api-key',
                      'FREEBLACKMARKET_API_KEY is missing — production boot will refuse to start.'
                  )
        );
        findings.push(
            env.FREEBLACKMARKET_WEBHOOK_SECRET
                ? pass('fbm-webhook-secret', 'FREEBLACKMARKET_WEBHOOK_SECRET is set.')
                : fail(
                      'fbm-webhook-secret',
                      'FREEBLACKMARKET_WEBHOOK_SECRET is missing — production boot will refuse to start and purchase webhooks cannot verify.'
                  )
        );
    }

    if (truthy(env.FREEBLACKMARKET_STUB)) {
        findings.push(
            fail(
                'fbm-stub',
                'FREEBLACKMARKET_STUB is set — the stub serves demo data and must never be enabled for go-live.'
            )
        );
    } else {
        findings.push(pass('fbm-stub', 'FBM stub is off.'));
    }

    const baseUrl = env.FREEBLACKMARKET_BASE_URL;
    if (!baseUrl) {
        findings.push(
            warn(
                'fbm-base-url',
                'FREEBLACKMARKET_BASE_URL unset — defaulting to https://api.freeblackmarket.com.'
            )
        );
    } else if (baseUrl.startsWith('http://')) {
        findings.push(
            fail(
                'fbm-base-url',
                `FREEBLACKMARKET_BASE_URL is plaintext http (${baseUrl}) — the bearer key would be sent unencrypted.`
            )
        );
    } else {
        findings.push(pass('fbm-base-url', `FREEBLACKMARKET_BASE_URL=${baseUrl}`));
    }

    // Placeholder marketplaces (mirrors assertPlaceholderMarketplacesDisabledForProduction).
    for (const key of PLACEHOLDER_KEYS) {
        if (truthy(env[key])) {
            findings.push(
                fail(
                    'placeholder-provider',
                    `${key} is enabled — production boot hard-fails on placeholder marketplaces.`
                )
            );
        }
    }
    if (!PLACEHOLDER_KEYS.some((key) => truthy(env[key]))) {
        findings.push(pass('placeholder-provider', 'All placeholder marketplaces are disabled.'));
    }

    // Step 3 — Stripe (real subscription checkout).
    if (!env.STRIPE_SECRET_KEY) {
        findings.push(
            warn(
                'stripe-secret',
                'STRIPE_SECRET_KEY unset — subscription checkout stays on the deterministic mock (fine for a catalog-only launch).'
            )
        );
    } else {
        if (charge && env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
            findings.push(
                warn(
                    'stripe-secret',
                    'STRIPE_SECRET_KEY is a TEST key while --charge was requested.'
                )
            );
        } else {
            findings.push(pass('stripe-secret', 'STRIPE_SECRET_KEY is set.'));
        }
        findings.push(
            env.STRIPE_CHECKOUT_SUCCESS_URL && env.STRIPE_CHECKOUT_CANCEL_URL
                ? pass('stripe-return-urls', 'Stripe checkout success/cancel URLs are set.')
                : fail(
                      'stripe-return-urls',
                      'STRIPE_CHECKOUT_SUCCESS_URL / STRIPE_CHECKOUT_CANCEL_URL missing — live Checkout Sessions need return URLs.'
                  )
        );
        findings.push(
            env.STRIPE_WEBHOOK_SECRET
                ? pass(
                      'stripe-webhook-secret',
                      'STRIPE_WEBHOOK_SECRET is set (Billing Portal cus_ sync can verify).'
                  )
                : warn(
                      'stripe-webhook-secret',
                      'STRIPE_WEBHOOK_SECRET unset — checkout.session.completed sync cannot verify; Billing Portal stays on the mock path.'
                  )
        );
        const missingPrices = RUNBOOK_STRIPE_PRICE_KEYS.filter((key) => !env[key]);
        if (missingPrices.length > 0) {
            findings.push(
                warn(
                    'stripe-price-ids',
                    `Missing plan price ids (only plans you sell need one): ${missingPrices.join(
                        ', '
                    )}`
                )
            );
        } else {
            findings.push(pass('stripe-price-ids', 'All runbook plan price ids are set.'));
        }
    }

    // Step 4 — reveal the marketplace surface.
    if (env.BLACKOUT_MONETIZATION_MARKETPLACE === 'true') {
        findings.push(
            pass(
                'marketplace-flag',
                'BLACKOUT_MONETIZATION_MARKETPLACE=true (buyer surface revealed once beta-unlock is off).'
            )
        );
    } else {
        findings.push(
            warn(
                'marketplace-flag',
                'BLACKOUT_MONETIZATION_MARKETPLACE is not true — with beta-unlock off the buyer marketplace surface stays hidden.'
            )
        );
    }

    // Step 5 — beta-unlock (the actual "charge for real" flip).
    const betaKeys = ['BLACKOUT_BETA_UNLOCK_ALL', 'VITE_BLACKOUT_BETA_UNLOCK_ALL'];
    const betaOn = betaKeys.filter((key) => env[key] === 'true');
    if (betaOn.length > 0) {
        const detail = `${betaOn.join(
            ' and '
        )} still 'true' — every premium feature resolves as owned and nothing is charged.`;
        findings.push(charge ? fail('beta-unlock', detail) : warn('beta-unlock', detail));
    } else {
        findings.push(
            pass('beta-unlock', 'Beta-unlock is off — entitlements resolve from real purchases.')
        );
    }

    return findings;
}

/**
 * HTTP-mode checks against a running stack. Read-only: GETs plus one
 * deliberately unsigned webhook POST that MUST be rejected. `fetchImpl` is
 * injectable for tests.
 */
export async function evaluateHttp(baseUrl, { charge = false, fetchImpl = fetch } = {}) {
    const findings = [];
    const url = (path) => new URL(path, baseUrl).toString();
    const get = async (path) => {
        try {
            const response = await fetchImpl(url(path), { redirect: 'manual' });
            return { response };
        } catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    };

    const health = await get('/health');
    if (health.error || !health.response?.ok) {
        findings.push(
            fail(
                'health',
                `GET /health unreachable (${
                    health.error ?? `status ${health.response?.status}`
                }) — is the API up at ${baseUrl}?`
            )
        );
    } else {
        findings.push(pass('health', 'API is up.'));
    }

    // Runbook verify #1 — the catalog serves rows with feature keys.
    const catalog = await get('/v1/marketplace/listings');
    if (catalog.error || !catalog.response?.ok) {
        findings.push(
            fail(
                'catalog',
                `GET /v1/marketplace/listings failed (${
                    catalog.error ?? `status ${catalog.response?.status}`
                }).`
            )
        );
    } else {
        let listings = [];
        try {
            const body = await catalog.response.json();
            listings = Array.isArray(body?.listings) ? body.listings : [];
        } catch {
            findings.push(
                fail(
                    'catalog',
                    'GET /v1/marketplace/listings did not return JSON — is the base URL pointing at the API (not the SPA)?'
                )
            );
        }
        if (listings.length === 0) {
            findings.push(
                warn(
                    'catalog',
                    'Catalog is empty — has the FBM seed (seed-blackout-catalog) been run?'
                )
            );
        } else {
            const stubRows = listings.filter(
                (l) =>
                    typeof l?.providerListingId === 'string' &&
                    l.providerListingId.startsWith('stub-')
            );
            if (stubRows.length > 0) {
                const detail = `${stubRows.length}/${listings.length} catalog rows are stub-seeded demo data (FREEBLACKMARKET_STUB active?).`;
                findings.push(charge ? fail('catalog-stub', detail) : warn('catalog-stub', detail));
            } else {
                findings.push(
                    pass('catalog-stub', `Catalog serves ${listings.length} non-stub rows.`)
                );
            }
            const withFeatureKeys = listings.filter(
                (l) => Array.isArray(l?.featureKeys) && l.featureKeys.length > 0
            );
            findings.push(
                withFeatureKeys.length > 0
                    ? pass(
                          'catalog-feature-keys',
                          `${withFeatureKeys.length}/${listings.length} rows carry featureKeys (entitlement bridge live).`
                      )
                    : warn(
                          'catalog-feature-keys',
                          'No catalog row carries featureKeys — purchases would grant nothing in-app.'
                      )
            );
        }
    }

    // Seller surface — providers advertise creator publishing.
    const providers = await get('/v1/creator/providers');
    if (providers.error || !providers.response?.ok) {
        findings.push(
            fail(
                'seller-surface',
                `GET /v1/creator/providers failed (${
                    providers.error ?? `status ${providers.response?.status}`
                }).`
            )
        );
    } else {
        try {
            const body = await providers.response.json();
            const fbm = (body?.providers ?? []).find((p) => p?.id === 'freeblackmarket');
            if (
                fbm &&
                Array.isArray(fbm.capabilities) &&
                fbm.capabilities.includes('creator-write')
            ) {
                findings.push(
                    pass(
                        'seller-surface',
                        'freeblackmarket advertises creator-write — sellers can post listings.'
                    )
                );
            } else {
                findings.push(
                    fail(
                        'seller-surface',
                        'freeblackmarket is not advertised with creator-write — the seller path is not live.'
                    )
                );
            }
        } catch {
            findings.push(fail('seller-surface', 'GET /v1/creator/providers did not return JSON.'));
        }
    }

    // Webhook hardening — an unsigned payload must be rejected, proving the
    // shared secret is configured and signature verification is enforced.
    try {
        const response = await fetchImpl(url('/v1/marketplace/webhooks/freeblackmarket'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ preflight: 'unsigned-probe' }),
        });
        if (response.status >= 200 && response.status < 300) {
            findings.push(
                fail(
                    'webhook-signature',
                    'Unsigned webhook was ACCEPTED — signature verification is not enforced.'
                )
            );
        } else if (response.status === 404) {
            findings.push(
                fail(
                    'webhook-signature',
                    'Webhook route missing (404) — FBM events have nowhere to land.'
                )
            );
        } else {
            findings.push(
                pass('webhook-signature', `Unsigned webhook rejected (status ${response.status}).`)
            );
        }
    } catch (error) {
        findings.push(
            fail(
                'webhook-signature',
                `Webhook probe failed: ${error instanceof Error ? error.message : String(error)}`
            )
        );
    }

    return findings;
}

export function summarize(findings) {
    const counts = { PASS: 0, WARN: 0, FAIL: 0 };
    for (const item of findings) counts[item.level] += 1;
    return counts;
}

function parseArgs(argv) {
    const args = { charge: false, baseUrl: null, envOnly: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--charge') args.charge = true;
        else if (arg === '--env-only') args.envOnly = true;
        else if (arg === '--base-url') args.baseUrl = argv[++i] ?? null;
        else if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length);
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const findings = [...evaluateEnv(process.env, { charge: args.charge })];
    if (args.baseUrl && !args.envOnly) {
        findings.push(...(await evaluateHttp(args.baseUrl, { charge: args.charge })));
    }

    for (const item of findings) {
        const icon = item.level === 'PASS' ? '✅' : item.level === 'WARN' ? '⚠️ ' : '❌';
        console.log(`${icon} [${item.level}] ${item.check}: ${item.detail}`);
    }
    const counts = summarize(findings);
    console.log(
        `\nMonetization go-live preflight${args.charge ? ' (--charge strict mode)' : ''}: ` +
            `${counts.PASS} pass, ${counts.WARN} warn, ${counts.FAIL} fail.` +
            (args.baseUrl ? '' : ' (env mode only — add --base-url to probe a running stack)')
    );
    console.log(
        'Reminder: the legal/compliance gate (MARKETPLACE_AUDIT.md §9) requires human sign-off; this tool cannot check it.'
    );
    if (counts.FAIL > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
