import { expect, type Page } from '@playwright/test';

/**
 * Helpers for the navigation-audit Playwright specs. Mirrors the
 * crawler's invariants so a developer can iterate on one route without
 * rerunning the full `pnpm tsx tools/audit-navigation/crawl-web.ts`
 * sweep. Routes live in `tools/audit-navigation/route-manifest.ts`; the
 * specs import that manifest directly so the two stay in lockstep.
 *
 * Viewport, bootstrap-gate and modal helpers are shared with the
 * state-explosion suite and live in `../_shared`; they are re-exported here
 * so specs can keep importing everything from `./helpers`.
 *
 * `isBootstrapGated` lets route-level invariants skip when no real Matrix
 * session exists — the gate's own invariants are exercised by the
 * aggregate crawler run.
 */

export {
    assertModalClosed,
    isBootstrapGated,
    openModal,
    setViewport,
    VIEWPORTS,
    type ViewportName,
} from '../_shared';

/**
 * Asserts an AppShell-rendered Home affordance is present and visible.
 * Tolerates the three places we add Home: the desktop PrimaryRail (via
 * testid or its slotted `homeButton`), the mobile BottomTabBar, and any
 * route-local fallback anchor pointing at `/home`.
 */
export const expectHomeButtonVisible = async (page: Page): Promise<void> => {
    const candidates = [
        '[data-testid="primary-rail-home"]',
        '[data-testid="bottom-tab-home"]',
        '[data-testid="workspace-tab-bar-home"]',
        '[data-testid="bootstrap-home"]',
        '[data-panel-id="shell.home"]',
        'a[href="/home"]',
        'a[href="/home/"]',
        '[aria-label="Home"]',
    ];
    for (const selector of candidates) {
        const locator = page.locator(selector).first();
        if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
            return;
        }
    }
    throw new Error(
        `No Home affordance found at ${page.url()} — checked: ${candidates.join(', ')}`
    );
};

export const expectNotDeadEnd = async (page: Page): Promise<void> => {
    const internalAnchors = await page.locator('a[href^="/"]:visible').count();
    const backButtons = await page
        .locator('[data-testid="mobile-top-bar-back"]:visible, [aria-label="Go back"]:visible')
        .count();
    if (internalAnchors + backButtons === 0) {
        throw new Error(`Dead end: no outbound navigation visible at ${page.url()}`);
    }
};

/**
 * Probes the page for horizontal overflow on the document root and for
 * elements that hide content past their `overflow: hidden` clip. The
 * 16px tolerance matches the crawler.
 */
export const detectOverflow = async (
    page: Page
): Promise<{ horizontal: boolean; clipped: number }> =>
    page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const horizontal = Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth > 2;
        let clipped = 0;
        const elements = Array.from(document.querySelectorAll<HTMLElement>('main *'));
        const cap = Math.min(elements.length, 1_500);
        for (let i = 0; i < cap; i += 1) {
            const el = elements[i];
            const style = window.getComputedStyle(el);
            if (style.overflow !== 'hidden' && style.overflowX !== 'hidden') continue;
            const overflowBy = Math.max(
                el.scrollWidth - el.clientWidth,
                el.scrollHeight - el.clientHeight
            );
            if (overflowBy > 16) clipped += 1;
        }
        return { horizontal, clipped };
    });

export const expectNoOverflow = async (page: Page): Promise<void> => {
    const { horizontal, clipped } = await detectOverflow(page);
    expect(horizontal, `horizontal overflow at ${page.url()}`).toBe(false);
    expect(clipped, `clipped content count at ${page.url()}`).toBeLessThanOrEqual(0);
};
