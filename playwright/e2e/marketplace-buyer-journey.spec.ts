import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Marketplace buyer-journey E2E — exercises the FBM stub provider end-to-end
 * through the client UI (see playwright/e2e/launch-smoke/auth.spec.ts for the
 * harness conventions):
 *
 *   1. Sign in as the smoke member.
 *   2. Open the `/market` destination (MarketShell → MarketplaceSlice).
 *   3. Stub-seeded listings render in the catalog.
 *   4. Click through to a listing detail (`/market/listings/:provider/:id`).
 *   5. Purchase via the stub checkout: POST /v1/marketplace/checkout mints a
 *      stub session; the embedded overlay iframe serves
 *      GET /v1/marketplace/stub/checkout/:sessionId whose "Complete purchase"
 *      button POSTs .../complete → signed webhook → entitlement grant. When
 *      the overlay iframe cannot serve the stub page (e.g. the API's redirect
 *      URL isn't reachable from the client origin), the spec drives the
 *      completion endpoint directly — same server-side path.
 *   6. The entitlement surfaces: the listing CTA reads "Owned" and the
 *      Library view lists the purchase (GET /v1/marketplace/entitlements).
 *
 * Prerequisites beyond the launch-smoke set:
 *   - The API behind the target stack must run with FREEBLACKMARKET_STUB=1
 *     (the spec probes the catalog for stub-seeded listings and skips
 *     otherwise, so launch-smoke environments without the stub never
 *     false-fail).
 *   - `/v1/*` reachable on the client origin (production nginx proxy mode),
 *     or BLACKOUT_E2E_API_BASE_URL pointing at the API origin. For the
 *     embedded overlay leg the API should advertise absolute redirect URLs
 *     (BLACKOUT_PUBLIC_API_BASE_URL) unless the client origin proxies /v1/*;
 *     the direct-drive fallback keeps the journey green either way.
 *
 * Env inputs:
 *   - BLACKOUT_E2E_BASE_URL      — live-stack gate (skips otherwise)
 *   - BLACKOUT_E2E_API_BASE_URL  — API origin when not same-origin (optional)
 *   - LS_AUTH_USERNAME/PASSWORD  — buyer credentials (smoke_member_a default)
 *   - LS_MARKET_LISTING_ID       — stub listing to buy (stub-stickers-cats
 *                                  default; falls back to any stub-* listing)
 */

const TARGET_LISTING_ID = process.env.LS_MARKET_LISTING_ID ?? 'stub-stickers-cats';

const CHECKOUT_ENDPOINT_RE = /\/v1\/marketplace\/checkout$/;
const STUB_COMPLETE_RE = /\/v1\/marketplace\/stub\/checkout\/[^/]+\/complete$/;

function resolveApiBase(baseURL: string | undefined): string {
    return (
        process.env.BLACKOUT_E2E_API_BASE_URL ??
        process.env.BLACKOUT_E2E_BASE_URL ??
        baseURL ??
        'http://127.0.0.1:8080'
    );
}

interface StubProbe {
    ok: boolean;
    reason: string;
    listing?: { id: string; title: string };
}

/**
 * Detects whether the target API runs the FBM stub provider by looking for
 * its seeded `stub-*` listings in the public catalog. Anything else — the
 * endpoint missing (SPA HTML instead of JSON), an empty catalog, or the real
 * FBM provider — resolves to a skip, never a failure.
 */
async function probeFbmStub(
    request: APIRequestContext,
    baseURL: string | undefined
): Promise<StubProbe> {
    const url = new URL(
        '/v1/marketplace/listings?providerId=freeblackmarket',
        resolveApiBase(baseURL)
    ).toString();
    try {
        const response = await request.get(url, { timeout: 15_000 });
        if (!response.ok()) {
            return { ok: false, reason: `catalog endpoint responded ${response.status()}` };
        }
        const body = (await response.json()) as {
            listings?: Array<{ providerListingId?: string; title?: string }>;
        };
        const stubListings = (body.listings ?? []).filter((listing) =>
            listing.providerListingId?.startsWith('stub-')
        );
        if (stubListings.length === 0) {
            return {
                ok: false,
                reason: 'no stub-seeded listings in the catalog (FREEBLACKMARKET_STUB=1 not set?)',
            };
        }
        const target =
            stubListings.find((listing) => listing.providerListingId === TARGET_LISTING_ID) ??
            stubListings[0];
        return {
            ok: true,
            reason: 'ok',
            listing: {
                id: target.providerListingId as string,
                title: target.title ?? (target.providerListingId as string),
            },
        };
    } catch (error) {
        return {
            ok: false,
            reason: `catalog probe failed: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }
}

async function loginAs(page: Page, username: string, password: string) {
    await page.goto('/');
    await page.getByLabel(/username/i).fill(username);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/\/login/i, { timeout: 20_000 });
}

async function openMarket(page: Page) {
    await page.goto('/market');
    await expect(page.getByTestId('market-shell-body')).toBeVisible({ timeout: 20_000 });
}

const requiresFbmStub = test.extend({});

// Set per-test by beforeEach (workers: 1 in playwright.launch-smoke.config.ts).
let stubListing: { id: string; title: string } | null = null;

requiresFbmStub.beforeEach(async ({ request, baseURL }, testInfo) => {
    if (!process.env.BLACKOUT_E2E_BASE_URL && !process.env.CI) {
        testInfo.skip(true, 'BLACKOUT_E2E_BASE_URL not set — skipping live-stack E2E.');
    }
    // Login → catalog → embedded checkout → entitlement refresh doesn't fit the
    // default 30s budget.
    testInfo.setTimeout(120_000);
    const probe = await probeFbmStub(request, baseURL);
    if (!probe.ok || !probe.listing) {
        testInfo.skip(
            true,
            `FBM stub not available on the target stack — ${probe.reason}. ` +
                'Start the API with FREEBLACKMARKET_STUB=1 to run the buyer journey.'
        );
        return;
    }
    stubListing = probe.listing;
});

requiresFbmStub('MKT-01: /market renders the FBM stub catalog', async ({ page }) => {
    const listing = stubListing as { id: string; title: string };
    await loginAs(
        page,
        process.env.LS_AUTH_USERNAME ?? 'smoke_member_a',
        process.env.LS_AUTH_PASSWORD ?? 'change-me'
    );
    await openMarket(page);

    // The catalog grid surfaces stub-seeded listings with detail links.
    await expect(page.getByTestId('listing-card-detail-link').first()).toBeVisible({
        timeout: 20_000,
    });

    // Narrow to the target listing via the server-side `q` filter to keep the
    // assertion independent of grid ordering.
    await page.getByPlaceholder(/search listings/i).fill(listing.title);
    await expect(
        page.getByTestId('listing-card-detail-link').filter({ hasText: listing.title }).first()
    ).toBeVisible({ timeout: 20_000 });
});

requiresFbmStub(
    'MKT-02: buyer journey — stub checkout purchase grants an entitlement',
    async ({ page, request, baseURL }) => {
        const listing = stubListing as { id: string; title: string };
        await loginAs(
            page,
            process.env.LS_AUTH_USERNAME ?? 'smoke_member_a',
            process.env.LS_AUTH_PASSWORD ?? 'change-me'
        );
        await openMarket(page);

        // Catalog → listing detail.
        await page.getByPlaceholder(/search listings/i).fill(listing.title);
        await page
            .getByTestId('listing-card-detail-link')
            .filter({ hasText: listing.title })
            .first()
            .click();
        await expect(page.getByTestId('market-listing-detail')).toBeVisible({ timeout: 20_000 });

        const purchase = page.getByTestId('market-listing-purchase');
        await expect(purchase).toHaveText(/purchase|owned/i, { timeout: 15_000 });
        if (/owned/i.test((await purchase.textContent()) ?? '')) {
            test.skip(
                true,
                `Listing ${listing.id} is already owned by the smoke user on this stack — ` +
                    'reset the stub entitlement state (or point LS_MARKET_LISTING_ID at an ' +
                    'unowned listing) to exercise the purchase leg.'
            );
        }

        // Purchase → stub checkout session.
        const checkoutResponsePromise = page
            .waitForResponse(
                (response) =>
                    CHECKOUT_ENDPOINT_RE.test(response.url()) &&
                    response.request().method() === 'POST',
                { timeout: 30_000 }
            )
            .catch(() => null);
        await purchase.click();
        const checkoutResponse = await checkoutResponsePromise;
        expect(checkoutResponse, 'POST /v1/marketplace/checkout was issued').not.toBeNull();
        expect(checkoutResponse?.ok(), 'checkout session was created').toBe(true);
        const checkout = (await checkoutResponse?.json()) as {
            sessionId: string;
            redirectUrl: string;
            embed?: boolean;
        };
        expect(checkout.sessionId).toBeTruthy();

        // Complete the purchase. Preferred path: the embedded overlay iframe
        // serving the stub page — its "Complete purchase" button POSTs the
        // completion endpoint and postMessages checkout.completed to the host.
        let completed = false;
        const overlay = page.getByRole('dialog', { name: 'Marketplace checkout' });
        if (checkout.embed) {
            const completeResponsePromise = page
                .waitForResponse(
                    (response) =>
                        STUB_COMPLETE_RE.test(response.url()) &&
                        response.request().method() === 'POST',
                    { timeout: 25_000 }
                )
                .catch(() => null);
            try {
                await expect(overlay).toBeVisible({ timeout: 10_000 });
                await page
                    .frameLocator('iframe[title="Marketplace checkout"]')
                    .getByRole('button', { name: /complete purchase/i })
                    .click({ timeout: 20_000 });
                const completeResponse = await completeResponsePromise;
                completed = completeResponse?.ok() === true;
            } catch {
                completed = false;
            }
            // The overlay closes itself only when the postMessage origin check can
            // run (absolute redirect URLs); close it manually otherwise.
            if (await overlay.isVisible().catch(() => false)) {
                await page
                    .getByRole('button', { name: /close checkout/i })
                    .click()
                    .catch(() => undefined);
            }
        }
        if (!completed) {
            // Fallback: drive the stub checkout directly. Same server-side path
            // (signed webhook → entitlement grant) and idempotent per session, so
            // an overlay leg that already completed is not double-granted.
            const completeResponse = await request.post(
                new URL(
                    `/v1/marketplace/stub/checkout/${checkout.sessionId}/complete`,
                    resolveApiBase(baseURL)
                ).toString(),
                { timeout: 15_000 }
            );
            expect(completeResponse.ok(), 'stub checkout completion (direct drive) succeeded').toBe(
                true
            );
        }
        await expect(overlay).not.toBeVisible({ timeout: 10_000 });

        // The entitlement surfaces on the listing CTA after a fresh entitlement
        // fetch (the detail view checks ownership on mount).
        await page.reload();
        await expect(page.getByTestId('market-listing-detail')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId('market-listing-purchase')).toHaveText(/owned/i, {
            timeout: 20_000,
        });

        // ...and in the Library view (GET /v1/marketplace/entitlements) — rows
        // render as "<kind> · <providerListingId> · granted".
        await page.getByRole('link', { name: /back to the black market/i }).click();
        await expect(page.getByTestId('market-shell-body')).toBeVisible({ timeout: 20_000 });
        await page.getByRole('button', { name: /^library \(/i }).click();
        await expect(page.getByText(listing.id).first()).toBeVisible({ timeout: 20_000 });
    }
);
