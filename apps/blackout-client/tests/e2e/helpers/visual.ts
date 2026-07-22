import { expect, test as base, type Locator, type Page } from '@playwright/test';

export type VisualTheme = 'light' | 'dark';
export type VisualViewport = 'mobile' | 'tablet' | 'desktop';

export interface VisualProjectMeta {
    viewport: VisualViewport;
    theme: VisualTheme;
}

// Map our matrix theme tokens to the persisted Blackout theme IDs defined in
// apps/blackout-client/src/app/plugins/theme/themeCatalog.ts. We deliberately
// pick the highest-contrast member of each family so a regression in any
// shared design token surfaces in the diff.
const THEME_ID: Record<VisualTheme, string> = {
    light: 'light_grove',
    dark: 'dark_canopy',
};

const SETTINGS_STORAGE_KEY = 'blackout.settings.v1';

export const parseVisualProject = (projectName: string): VisualProjectMeta | null => {
    const match = /^visual-(mobile|tablet|desktop)-(light|dark)$/.exec(projectName);
    if (!match) return null;
    return {
        viewport: match[1] as VisualViewport,
        theme: match[2] as VisualTheme,
    };
};

// Prime the persisted Jotai settings atom before the SPA boots so the first
// paint already uses the target theme — avoids a flash of the default theme
// that would otherwise contaminate the screenshot.
export const primeTheme = async (page: Page, theme: VisualTheme): Promise<void> => {
    const themeId = THEME_ID[theme];
    await page.addInitScript(
        ({ key, id }) => {
            const existing = window.localStorage.getItem(key);
            const parsed = existing ? JSON.parse(existing) : {};
            parsed.theme = id;
            window.localStorage.setItem(key, JSON.stringify(parsed));
        },
        { key: SETTINGS_STORAGE_KEY, id: themeId }
    );
};

// Wait until the React root has hydrated. Mirrors the readiness gate used by
// apps/blackout-client/tests/e2e/shell.spec.ts so visual specs don't snap a
// blank #root.
export const waitForAppReady = async (page: Page): Promise<void> => {
    const root = page.locator('#root');
    await expect(root).toBeAttached();
    await expect(root).not.toBeEmpty({ timeout: 30_000 });
    await page.waitForLoadState('networkidle').catch(() => {
        // networkidle is best-effort: some SPAs keep long-poll connections open.
    });
};

export interface SnapOptions {
    /** Locators whose pixels should be masked (timestamps, presence dots, etc.). */
    mask?: Locator[];
    fullPage?: boolean;
}

export const snapVisual = async (
    page: Page,
    name: string,
    opts: SnapOptions = {}
): Promise<void> => {
    await waitForAppReady(page);
    await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: opts.fullPage ?? true,
        mask: opts.mask,
    });
};

// Fixture wrapper: auto-applies the project-derived theme before each test so
// individual specs stay free of plumbing.
export const visualTest = base.extend<{ visualMeta: VisualProjectMeta }>({
    visualMeta: async ({ page }, use, testInfo) => {
        const meta = parseVisualProject(testInfo.project.name);
        if (!meta) {
            throw new Error(
                `visualTest invoked under non-visual project "${testInfo.project.name}". ` +
                    'Visual specs must be matched by the visual-* projects in playwright.config.ts.'
            );
        }
        // Anonymous-shell visual specs must be hermetic: the login card probes
        // the configured homeserver for supported flows, and CI's ability to
        // reach that production host varies per attempt — the card renders a
        // different variant depending on whether the probe succeeds, which no
        // committed baseline can satisfy. Abort every cross-origin request so
        // the shell always renders the offline state and baselines stay stable.
        await page.route('**/*', (route) => {
            const { hostname } = new URL(route.request().url());
            if (hostname === '127.0.0.1' || hostname === 'localhost') {
                return route.continue();
            }
            return route.abort();
        });
        await primeTheme(page, meta.theme);
        await use(meta);
    },
});
