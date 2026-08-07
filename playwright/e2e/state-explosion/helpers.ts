import { expect, type Page, type Locator } from '@playwright/test';
import { dialogLocator, isBootstrapGated } from '../_shared';

/**
 * Helpers for the state-explosion suite. The suite stresses interactions
 * across two or more in-flight UI state machines (popup + soft keyboard,
 * modal + sync reconnect, transition + viewport resize, etc.) so each
 * helper is designed to be composable and side-effect-light: the spec
 * decides the timing, the helper just exposes the lever.
 *
 * Viewport, bootstrap-gate and modal helpers are shared with the
 * navigation-audit suite and live in `../_shared`; they are re-exported here
 * so specs can keep importing everything from `./helpers`.
 */

export {
    assertModalClosed,
    isBootstrapGated,
    openModal,
    setViewport,
    VIEWPORTS,
    type ViewportName,
} from '../_shared';

export const closeModal = async (page: Page, name: string): Promise<void> => {
    await page.evaluate((modalName) => {
        const fn = (window as unknown as { __closeModal?: (n: string) => void }).__closeModal;
        fn?.(modalName);
    }, name);
};

export const assertModalOpen = async (page: Page, name: string): Promise<void> => {
    await expect(dialogLocator(page, name)).toBeVisible({ timeout: 2_000 });
};

/**
 * Drives the audit sentinel + waits until either the AppShell or the
 * bootstrap gate is mounted. Returns true when the AppShell is up and
 * the __openModal bridge is callable; false when the client is still on
 * the bootstrap auth gate (specs should `test.skip()` in that case).
 */
export const bootAppShell = async (page: Page): Promise<boolean> => {
    await page.context().addInitScript(() => {
        (window as unknown as { __BLACKOUT_AUDIT__: boolean }).__BLACKOUT_AUDIT__ = true;
    });
    await page.goto('/home/', { waitUntil: 'domcontentloaded' });
    if (await isBootstrapGated(page)) return false;
    // Wait for the bridge to be exposed by the AppShell effect.
    return page
        .waitForFunction(
            () =>
                typeof (window as unknown as { __openModal?: unknown }).__openModal === 'function',
            null,
            { timeout: 5_000 }
        )
        .then(() => true)
        .catch(() => false);
};

/**
 * Fakes a mobile soft-keyboard open / close envelope. The on-device
 * behavior is: visualViewport.height drops by ~ keyboard height,
 * visualViewport.width stays the same, and a 'resize' event fires on
 * window.visualViewport (not on window itself on iOS Safari, sometimes
 * both on Android Chrome).
 *
 * We patch visualViewport in-page rather than via CDP because CDP's
 * Emulation.setVisibleSize does not synthesize the visualViewport
 * resize event.
 */
export const simulateMobileKeyboard = async (
    page: Page,
    args: { open: boolean; keyboardHeightPx?: number } = { open: true }
): Promise<void> => {
    await page.evaluate(
        ({ open, keyboardHeightPx }) => {
            const vv = window.visualViewport;
            if (!vv) return;
            const offsetHeight = open ? keyboardHeightPx ?? 320 : 0;
            const baseHeight =
                (vv as unknown as { __baseHeight?: number }).__baseHeight ?? vv.height;
            (vv as unknown as { __baseHeight?: number }).__baseHeight = baseHeight;
            try {
                Object.defineProperty(vv, 'height', {
                    configurable: true,
                    get: () => baseHeight - offsetHeight,
                });
            } catch {
                // Some engines (Firefox) won't allow redefinition; the
                // resize event alone is enough to exercise listeners.
            }
            vv.dispatchEvent(new Event('resize'));
            window.dispatchEvent(new Event('resize'));
        },
        { open: args.open, keyboardHeightPx: args.keyboardHeightPx }
    );
};

/**
 * Wraps `page.route()` to delay every response matching `urlGlob` by
 * `ms` milliseconds. Returns a `dispose` function the spec calls when
 * the latency segment is over so unrelated assertions don't see the
 * extra delay.
 */
export const withLatency = async (
    page: Page,
    ms: number,
    urlGlob: string
): Promise<() => Promise<void>> => {
    const handler = async (route: import('@playwright/test').Route) => {
        await new Promise((r) => setTimeout(r, ms));
        await route.continue();
    };
    await page.route(urlGlob, handler);
    return async () => {
        await page.unroute(urlGlob, handler);
    };
};

/**
 * Fires `n` clicks on `locator` with a small inter-click delay. The
 * default 12ms keeps the events in the same React commit batch most
 * of the time, which is the regime "rapid double click on the open
 * button" tests need to exercise.
 */
export const rapidClick = async (locator: Locator, n: number, delayMs = 12): Promise<void> => {
    for (let i = 0; i < n; i += 1) {
        await locator.click({ delay: 0, force: true });
        if (i < n - 1 && delayMs > 0) {
            await locator.page().waitForTimeout(delayMs);
        }
    }
};

/**
 * Counts the open dialogs (any element with `role="dialog"` visible)
 * — the suite asserts this stays at 1 even under burst clicks.
 */
export const visibleDialogCount = async (page: Page): Promise<number> => {
    return page.locator('[role="dialog"]:visible').count();
};

/**
 * Tracks console errors during a block of work. Returns the collected
 * errors so the spec can assert the block produced none.
 */
export const trackConsoleErrors = (page: Page): { errors: string[]; stop: () => void } => {
    const errors: string[] = [];
    const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
        if (msg.type() === 'error') errors.push(msg.text());
    };
    const onPageError = (err: Error) => errors.push(err.message);
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    return {
        errors,
        stop: () => {
            page.off('console', onConsole);
            page.off('pageerror', onPageError);
        },
    };
};
