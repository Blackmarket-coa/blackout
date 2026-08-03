import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Creator seller-journey E2E — the seller-side twin of
 * `marketplace-buyer-journey.spec.ts`, exercising the guided sell flow
 * (`/creator/sell`, SellProductWizard) end-to-end against the FBM stub:
 *
 *   1. Sign in as the smoke member.
 *   2. Open `/creator/sell` and pick the "Digital download" template.
 *   3. Fill details (unique title), attach a small artifact file, skip
 *      preview media, and create the draft (POST /v1/creator/listings).
 *   4. Publish it from the wizard's post-create panel
 *      (POST /v1/creator/listings/:id/publish).
 *   5. The listing shows up on `/creator/listings`
 *      (GET /v1/creator/listings/mine).
 *
 * Prerequisites match the buyer journey: the target API must run with
 * FREEBLACKMARKET_STUB=1 (probed via the stub-seeded catalog; anything else
 * skips, never false-fails) so drafts hit the in-memory provider instead of a
 * real FBM. Docs: docs/guides/selling-on-the-black-market.md.
 *
 * Env inputs:
 *   - BLACKOUT_E2E_BASE_URL      — live-stack gate (skips otherwise)
 *   - BLACKOUT_E2E_API_BASE_URL  — API origin when not same-origin (optional)
 *   - LS_AUTH_USERNAME/PASSWORD  — seller credentials (smoke_member_a default)
 */

function resolveApiBase(baseURL: string | undefined): string {
    return (
        process.env.BLACKOUT_E2E_API_BASE_URL ??
        process.env.BLACKOUT_E2E_BASE_URL ??
        baseURL ??
        'http://127.0.0.1:8080'
    );
}

/**
 * Same stub detection as the buyer journey: only run when the target API
 * serves the FBM stub's seeded `stub-*` listings, so the spec never creates
 * drafts against a real marketplace.
 */
async function probeFbmStub(
    request: APIRequestContext,
    baseURL: string | undefined
): Promise<{ ok: boolean; reason: string }> {
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
            listings?: Array<{ providerListingId?: string }>;
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
        return { ok: true, reason: 'ok' };
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

const requiresFbmStub = test.extend({});

requiresFbmStub.beforeEach(async ({ request, baseURL }, testInfo) => {
    if (!process.env.BLACKOUT_E2E_BASE_URL && !process.env.CI) {
        testInfo.skip(true, 'BLACKOUT_E2E_BASE_URL not set — skipping live-stack E2E.');
    }
    // Login → wizard walkthrough → publish → listings refresh needs headroom.
    testInfo.setTimeout(120_000);
    const probe = await probeFbmStub(request, baseURL);
    if (!probe.ok) {
        testInfo.skip(
            true,
            `FBM stub not available on the target stack — ${probe.reason}. ` +
                'Start the API with FREEBLACKMARKET_STUB=1 to run the seller journey.'
        );
    }
});

requiresFbmStub(
    'SEL-01: guided sell flow — digital download drafts, publishes, and lists',
    async ({ page }) => {
        await loginAs(
            page,
            process.env.LS_AUTH_USERNAME ?? 'smoke_member_a',
            process.env.LS_AUTH_PASSWORD ?? 'change-me'
        );

        // Unique per run so the /creator/listings assertion can't match a row
        // left behind by an earlier run on the same stack.
        const title = `E2E Field Guide ${Date.now()}`;

        // Step 1 — template chooser.
        await page.goto('/creator/sell');
        await expect(page.getByTestId('sell-product-wizard')).toBeVisible({ timeout: 20_000 });
        await page.getByTestId('sell-template-digital_download').click();

        // Step 2 — details.
        await page.getByTestId('sell-title').fill(title);
        await page.getByTestId('sell-description').fill('Seller-journey E2E digital download.');
        await page.getByTestId('sell-next').click();

        // Step 3 — artifact: attach a small file through the file-list control.
        await page.getByTestId('artifact-file-input').setInputFiles({
            name: 'guide.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('e2e seller journey artifact'),
        });
        await expect(page.getByText('guide.pdf')).toBeVisible({ timeout: 10_000 });
        await page.getByTestId('sell-next').click();

        // Step 4 — preview media (optional; skip).
        await page.getByTestId('sell-next').click();

        // Step 5 — review → create draft.
        await expect(page.getByTestId('sell-create')).toBeVisible({ timeout: 10_000 });
        await page.getByTestId('sell-create').click();

        // Post-create panel: the draft exists and can be published.
        const publish = page.getByTestId('sell-publish');
        await expect(publish).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(title)).toBeVisible();
        await publish.click();
        // Publish flips the status chip off `draft` (stub: → published;
        // real review pipelines: → pending_review) and disables the button.
        await expect(publish).toBeDisabled({ timeout: 20_000 });

        // The listing surfaces in the management view.
        await page.goto('/creator/listings');
        await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 });
    }
);
