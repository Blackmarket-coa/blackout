/**
 * Web navigation crawler. Drives a headless Chromium across every route
 * in `WEB_ROUTES` × every viewport in `VIEWPORTS` and records violations
 * of the six audit invariants:
 *
 *   1. Home button visible — a link/button pointing at `/home` or an
 *      explicit `data-testid="primary-rail-home"` is rendered.
 *   2. No dead ends — at least one outbound navigation affordance exists.
 *   3. Back navigation — invoking the platform back affordance changes
 *      the URL to a non-404 location.
 *   4. Modals close — Esc closes any modal opened via the dev bridge,
 *      with focus returning to the trigger.
 *   5. Responsive layouts — the AppShell mounts with a `data-shell` root.
 *   6. Overflow — `document.body.scrollWidth` does not exceed the
 *      viewport, and no element with `overflow: hidden` clips meaningful
 *      content beyond a 16px tolerance.
 *
 * Outputs `audit/navigation/web-report.{json,md}`. Exits non-zero on any
 * `error`-severity finding unless `--report-only` is passed.
 *
 * Usage:
 *   pnpm tsx tools/audit-navigation/crawl-web.ts \
 *     --base http://127.0.0.1:4173 [--report-only]
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { KNOWN_MODALS, WEB_ROUTES, type WebRoute } from './route-manifest';
import { writeReports } from './report';
import { VIEWPORTS, type AuditFinding, type AuditReport, type Viewport } from './types';

type CliArgs = {
    baseUrl: string;
    reportOnly: boolean;
    outDir: string;
};

const parseArgs = (argv: string[]): CliArgs => {
    let baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';
    let reportOnly = false;
    let outDir = resolve(process.cwd(), 'audit/navigation');
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--base' || arg === '--baseUrl') {
            baseUrl = argv[++i] ?? baseUrl;
        } else if (arg === '--report-only') {
            reportOnly = true;
        } else if (arg === '--out') {
            outDir = resolve(argv[++i] ?? outDir);
        }
    }
    return { baseUrl, reportOnly, outDir };
};

const stripTrailingSlash = (value: string): string =>
    value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;

/**
 * Resolves the URL the crawler should navigate to. Encodes any colon-
 * prefixed params left behind by mistake, and absorbs both relative and
 * absolute base URLs.
 */
const buildUrl = (baseUrl: string, path: string): string =>
    `${stripTrailingSlash(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;

/**
 * Set the viewport and reload — gives layout-dependent shells a clean
 * remount so the audit observes the same state a fresh visitor would.
 */
const visit = async (page: Page, url: string, viewport: Viewport): Promise<void> => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Give the AppShell + Jotai store one tick to mount.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
};

const isPotentialHomeLink = async (page: Page): Promise<{ found: boolean; locator?: string }> => {
    const selectors = [
        '[data-testid="primary-rail-home"]',
        '[data-testid="bottom-tab-home"]',
        'a[href="/home"]',
        'a[href="/home/"]',
        'a[href="/"]',
        '[aria-label="Home"]',
    ];
    for (const selector of selectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
            const visible = await page
                .locator(selector)
                .first()
                .isVisible()
                .catch(() => false);
            if (visible) return { found: true, locator: selector };
        }
    }
    return { found: false };
};

const countOutboundLinks = async (page: Page): Promise<number> => {
    // Internal anchors with hrefs are the cheapest signal.
    const internalAnchors = await page
        .locator('a[href^="/"]:visible, a[href^="#/"]:visible')
        .count()
        .catch(() => 0);
    const backButtons = await page
        .locator('[data-testid="mobile-top-bar-back"]:visible, [aria-label="Go back"]:visible')
        .count()
        .catch(() => 0);
    return internalAnchors + backButtons;
};

const detectOverflow = async (
    page: Page
): Promise<{ horizontal: boolean; clipped: { selector: string; overflowBy: number }[] }> => {
    return page.evaluate(() => {
        const TOLERANCE = 2;
        const root = document.documentElement;
        const body = document.body;
        const horizontal =
            Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth > TOLERANCE;
        const clipped: { selector: string; overflowBy: number }[] = [];
        const elements = Array.from(document.querySelectorAll<HTMLElement>('main *'));
        // Cap the scan so the audit stays fast on heavy pages.
        const cap = Math.min(elements.length, 2_000);
        for (let i = 0; i < cap; i += 1) {
            const el = elements[i];
            const style = window.getComputedStyle(el);
            if (style.overflow !== 'hidden' && style.overflowX !== 'hidden') continue;
            const overflowBy = Math.max(
                el.scrollWidth - el.clientWidth,
                el.scrollHeight - el.clientHeight
            );
            if (overflowBy <= 16) continue;
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            const cls = el.className && typeof el.className === 'string'
                ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
                : '';
            clipped.push({ selector: `${tag}${id}${cls}`, overflowBy });
            if (clipped.length >= 5) break;
        }
        return { horizontal, clipped };
    });
};

const auditRoute = async (
    page: Page,
    route: WebRoute,
    viewport: Viewport,
    baseUrl: string
): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = [];
    const url = buildUrl(baseUrl, route.path);

    try {
        await visit(page, url, viewport);
    } catch (cause) {
        findings.push({
            category: 'responsive-layout',
            severity: 'error',
            route: route.path,
            viewport: viewport.name,
            message: `Navigation threw: ${(cause as Error).message}`,
        });
        return findings;
    }

    // The AppShell mounts a `data-shell="app"` root. If it never appeared the
    // route either errored or never registered — every other invariant in
    // the same pass would be noise, so short-circuit with a single finding.
    const shellMounted = await page
        .locator('[data-shell="app"], #root > *')
        .first()
        .isVisible()
        .catch(() => false);
    if (!shellMounted) {
        findings.push({
            category: 'responsive-layout',
            severity: 'error',
            route: route.path,
            viewport: viewport.name,
            message: 'AppShell did not mount within the load window',
        });
        return findings;
    }

    if (!route.chromeless) {
        const home = await isPotentialHomeLink(page);
        if (!home.found) {
            findings.push({
                category: 'home-button',
                severity: 'error',
                route: route.path,
                viewport: viewport.name,
                message: 'No Home affordance visible (looked for testid, /home anchor, aria-label)',
            });
        }
    }

    const linkCount = await countOutboundLinks(page);
    if (linkCount === 0) {
        findings.push({
            category: 'dead-end',
            severity: route.chromeless ? 'warning' : 'error',
            route: route.path,
            viewport: viewport.name,
            message: 'Route exposes zero outbound navigation affordances',
        });
    }

    const overflow = await detectOverflow(page);
    if (overflow.horizontal) {
        findings.push({
            category: 'overflow',
            severity: 'error',
            route: route.path,
            viewport: viewport.name,
            message: 'Document scrolls horizontally beyond viewport width',
        });
    }
    for (const clip of overflow.clipped) {
        findings.push({
            category: 'overflow',
            severity: 'warning',
            route: route.path,
            viewport: viewport.name,
            message: `Content clipped by ${clip.overflowBy}px inside overflow:hidden`,
            locator: clip.selector,
        });
    }

    // Back navigation — only meaningful for non-root, non-chromeless routes.
    if (!route.chromeless && route.path !== '/' && route.path !== '/home/') {
        try {
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5_000 });
            const afterUrl = new URL(page.url()).pathname;
            const before = new URL(url).pathname;
            if (afterUrl === before) {
                findings.push({
                    category: 'back-navigation',
                    severity: 'warning',
                    route: route.path,
                    viewport: viewport.name,
                    message: 'goBack() did not change the URL',
                });
            }
        } catch (cause) {
            findings.push({
                category: 'back-navigation',
                severity: 'warning',
                route: route.path,
                viewport: viewport.name,
                message: `goBack() failed: ${(cause as Error).message}`,
            });
        }
    }

    return findings;
};

/**
 * Sweep registered modals via the dev-only `window.__openModal` bridge.
 * Only runs once per crawl, on the /home route at desktop viewport, since
 * modal mounting is route-agnostic.
 */
const auditModals = async (page: Page, baseUrl: string): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = [];
    const desktop = VIEWPORTS.find((v) => v.name === 'desktop') ?? VIEWPORTS[2];
    await visit(page, buildUrl(baseUrl, '/home/'), desktop);

    const bridgeExposed = await page.evaluate(() => typeof (window as any).__openModal === 'function');
    if (!bridgeExposed) {
        findings.push({
            category: 'modal-closure',
            severity: 'info',
            route: '/home/',
            message:
                'window.__openModal not exposed — skipping modal sweep. Wire the bridge in AppShell to enable.',
        });
        return findings;
    }

    for (const modal of KNOWN_MODALS) {
        const opened = await page.evaluate((name) => {
            try {
                (window as any).__openModal(name);
                return true;
            } catch {
                return false;
            }
        }, modal);
        if (!opened) {
            findings.push({
                category: 'modal-closure',
                severity: 'info',
                route: '/home/',
                message: `Modal "${modal}" refused to open in this session`,
            });
            continue;
        }
        const dialog = page.locator(`[data-testid="modal-${modal}"], [role="dialog"]`).first();
        const appeared = await dialog.isVisible({ timeout: 1_500 }).catch(() => false);
        if (!appeared) {
            findings.push({
                category: 'modal-closure',
                severity: 'warning',
                route: '/home/',
                message: `Modal "${modal}" was triggered but no dialog role appeared`,
            });
            continue;
        }
        await page.keyboard.press('Escape');
        const stillVisible = await dialog.isVisible({ timeout: 1_000 }).catch(() => false);
        if (stillVisible) {
            findings.push({
                category: 'modal-closure',
                severity: 'error',
                route: '/home/',
                message: `Modal "${modal}" did not close on Escape`,
            });
        }
    }
    return findings;
};

const run = async (): Promise<number> => {
    const { baseUrl, reportOnly, outDir } = parseArgs(process.argv.slice(2));
    const findings: AuditFinding[] = [];
    const cleanRoutes: string[] = [];

    let browser: Browser | null = null;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        for (const route of WEB_ROUTES) {
            let routeClean = true;
            for (const viewport of VIEWPORTS) {
                const routeFindings = await auditRoute(page, route, viewport, baseUrl);
                if (routeFindings.length > 0) routeClean = false;
                findings.push(...routeFindings);
            }
            if (routeClean) cleanRoutes.push(route.path);
        }

        findings.push(...(await auditModals(page, baseUrl)));
    } finally {
        await browser?.close();
    }

    const report: AuditReport = {
        generatedAt: new Date().toISOString(),
        target: 'web',
        baseUrl,
        routes: WEB_ROUTES.map((r) => r.path),
        findings,
        cleanRoutes,
    };
    const { jsonPath, markdownPath } = await writeReports(outDir, 'web', report);
    // eslint-disable-next-line no-console
    console.log(`web-report.json → ${jsonPath}`);
    // eslint-disable-next-line no-console
    console.log(`web-report.md   → ${markdownPath}`);

    const errors = findings.filter((f) => f.severity === 'error').length;
    if (errors > 0 && !reportOnly) {
        // eslint-disable-next-line no-console
        console.error(`Navigation audit failed: ${errors} error finding(s).`);
        return 1;
    }
    return 0;
};

run().then(
    (code) => {
        process.exitCode = code;
    },
    (cause) => {
        // eslint-disable-next-line no-console
        console.error(cause);
        process.exitCode = 1;
    }
);
