import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Helpers shared by more than one Playwright suite.
 *
 * These started as a copy-paste block in both `navigation-audit/helpers.ts` and
 * `state-explosion/helpers.ts` and then drifted — most sharply on `openModal`,
 * which grew an `args` parameter on one side only. Each suite's `helpers.ts`
 * re-exports from here, so specs keep importing `./helpers` unchanged.
 *
 * Suite-specific helpers stay in their own suite. Only add something here once
 * a second suite genuinely needs it.
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
 * (`<main data-shell="bootstrap">`) rather than the AppShell. Specs use this to
 * skip invariants that only apply once a real Matrix session exists.
 */
export const isBootstrapGated = async (page: Page): Promise<boolean> =>
    (await page.locator('[data-shell="bootstrap"]').count()) > 0;

/** Matches either an explicitly-tagged modal or any open dialog. */
export const dialogLocator = (page: Page, name: string): Locator =>
    page.locator(`[data-testid="modal-${name}"], [role="dialog"]`).first();

/**
 * Opens a modal via the dev-only `window.__openModal` bridge. Returns `false`
 * when the bridge is unavailable so specs can `test.skip()` rather than fail.
 *
 * `args` is optional — state-explosion never passes it, navigation-audit does.
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
    await expect(dialogLocator(page, name)).toBeHidden({ timeout: 2_000 });
};
