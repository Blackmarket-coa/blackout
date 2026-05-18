/**
 * Shared types for the navigation consistency audit. Consumed by both the
 * Playwright crawler (`crawl-web.ts`) and the Expo static auditor
 * (`audit-mobile.ts`). Kept dependency-free so either entry point can
 * import without dragging the other's runtime requirements.
 */

export type Viewport = {
    name: 'mobile' | 'tablet' | 'desktop';
    width: number;
    height: number;
};

export const VIEWPORTS: readonly Viewport[] = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 900, height: 1280 },
    { name: 'desktop', width: 1280, height: 800 },
] as const;

/** Tag used to bucket findings in the markdown report. */
export type AuditCategory =
    | 'home-button'
    | 'dead-end'
    | 'back-navigation'
    | 'modal-closure'
    | 'responsive-layout'
    | 'overflow';

export type Severity = 'error' | 'warning' | 'info';

export type AuditFinding = {
    category: AuditCategory;
    severity: Severity;
    route: string;
    viewport?: Viewport['name'];
    message: string;
    /** Optional element selector or screen file path for triage. */
    locator?: string;
};

export type AuditReport = {
    generatedAt: string;
    target: 'web' | 'mobile';
    baseUrl?: string;
    routes: readonly string[];
    findings: readonly AuditFinding[];
    /** Routes that crawled cleanly across every viewport. */
    cleanRoutes: readonly string[];
};

export const summarize = (report: AuditReport) => {
    const errors = report.findings.filter((f) => f.severity === 'error').length;
    const warnings = report.findings.filter((f) => f.severity === 'warning').length;
    return { errors, warnings, total: report.findings.length };
};
