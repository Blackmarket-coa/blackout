import { expect, type Page } from '@playwright/test';

/**
 * Shared helpers for the navigation-audit Playwright specs. Mirrors the
 * crawler's invariants so a developer can iterate on one route without
 * rerunning the full `pnpm tsx tools/audit-navigation/crawl-web.ts`
 * sweep. Routes live in `tools/audit-navigation/route-manifest.ts`; the
 * specs import that manifest directly so the two stay in lockstep.
 */

export type ViewportName = 'mobile' | 'tablet' | 'desktop';

export const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
    mobile: { width: 375, height: 812 },
    tablet: { width: 900, height: 1280 },
    desktop: { width: 1280, height: 800 },
};

export const setViewport = async (page: Page, name: ViewportName): Promise<void> => {
    await page.setViewportSize(VIEWPORTS[name]);
};

/**
 * Returns true when the client is rendering its bootstrap auth gate
 * (`<main data-shell="bootstrap">`) rather than the AppShell. The
 * navigation-audit specs use this to skip route-level invariants that
 * only apply once a real Matrix session exists — the gate's own
 * invariants are exercised by the aggregate crawler run.
 */
export const isBootstrapGated = async (page: Page): Promise<boolean> =>
    (await page.locator('[data-shell="bootstrap"]').count()) > 0;

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
        if (
            (await locator.count()) > 0 &&
            (await locator.isVisible().catch(() => false))
        ) {
            return;
        }
    }
    throw new Error(
        `No Home affordance found at ${page.url()} — checked: ${candidates.join(', ')}`
    );
};

export const expectNotDeadEnd = async (page: Page): Promise<void> => {
    const internalAnchors = await page
        .locator('a[href^="/"]:visible')
        .count();
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
        const horizontal =
            Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth > 2;
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

/**
 * Opens a modal via the dev-only `window.__openModal` bridge. Returns
 * `false` when the bridge is unavailable so specs can `test.skip()`
 * rather than fail.
 */
export const openModal = async (
    page: Page,
    name: string,
    args?: Record<string, unknown>
): Promise<boolean> => {
    const exposed = await page.evaluate(
        () => typeof (window as unknown as { __openModal?: unknown }).__openModal === 'function'
    );
    if (!exposed) return false;
    return page.evaluate(
        ({ modalName, modalArgs }) => {
            try {
                (
                    window as unknown as {
                        __openModal: (n: string, a?: Record<string, unknown>) => void;
                    }
                ).__openModal(modalName, modalArgs);
                return true;
            } catch {
                return false;
            }
        },
        { modalName: name, modalArgs: args }
    );
};

export const assertModalClosed = async (page: Page, name: string): Promise<void> => {
    const dialog = page.locator(`[data-testid="modal-${name}"], [role="dialog"]`).first();
    await expect(dialog).toBeHidden({ timeout: 2_000 });
};
