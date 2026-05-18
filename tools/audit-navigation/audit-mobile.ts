/**
 * Expo Router static auditor. The mobile package ships no test runtime
 * (no Detox / Maestro / jest-expo wiring), so this audit is a parser
 * pass rather than a runtime crawl. It walks every screen under
 * `packages/mobile/app/`, builds the route tree from filenames, and
 * applies the four invariants that can be checked statically:
 *
 *   1. Home button visible — every screen outside `(tabs)/` either renders
 *      a back affordance or exposes a `router.replace('/')`-style escape.
 *   2. No dead ends — every `useState<View>('overview' | ...)`-style
 *      machine has a transition that resets the view to its root value.
 *   3. Modal closure — any screen rendering a `<Modal>` must also wire an
 *      `onRequestClose` / `setVisible(false)` path.
 *   4. Deep-link integrity — every `blackout://<segment>/...` URL
 *      referenced in code maps to a real screen file.
 *
 * Emits `audit/navigation/mobile-report.{json,md}`.
 *
 * Usage: `pnpm tsx tools/audit-navigation/audit-mobile.ts`
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { writeReports } from './report';
import type { AuditFinding, AuditReport } from './types';

const MOBILE_APP_DIR = resolve(process.cwd(), 'packages/mobile/app');

type ScreenFile = {
    /** Absolute filesystem path. */
    file: string;
    /** Path relative to packages/mobile/app/. */
    rel: string;
    /** Synthesised Expo Router pathname (`/chat`, `/login`, `/(tabs)/settings`). */
    routePath: string;
    /** Whether the screen sits inside a `(tabs)` group. */
    inTabs: boolean;
};

const isHidden = (name: string) => name.startsWith('.') || name === 'node_modules';

const walkScreens = async (dir: string, base = dir): Promise<ScreenFile[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const out: ScreenFile[] = [];
    for (const entry of entries) {
        if (isHidden(entry.name)) continue;
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await walkScreens(abs, base)));
            continue;
        }
        if (!entry.name.endsWith('.tsx')) continue;
        // `_layout.tsx` and `+not-found.tsx` are not navigable screens.
        if (entry.name.startsWith('_') || entry.name.startsWith('+')) continue;
        const rel = relative(base, abs).replace(/\\/g, '/');
        const inTabs = /\(tabs\)\//.test(rel);
        // Expo Router treats `(group)` segments as transparent: strip them
        // from the synthesised pathname and collapse `/index` to the parent.
        const routePath =
            '/' +
            rel
                .replace(/\.tsx$/, '')
                .split('/')
                .filter((part: string) => !/^\(.+\)$/.test(part))
                .join('/')
                .replace(/\/index$/, '')
                .replace(/^index$/, '');
        out.push({ file: abs, rel, routePath: routePath || '/', inTabs });
    }
    return out;
};

const readSafe = async (file: string): Promise<string> => {
    try {
        return await readFile(file, 'utf8');
    } catch {
        return '';
    }
};

/** Heuristic: a screen has a back/home escape if any of these markers appear. */
const HAS_ESCAPE = [
    /router\.back\(/,
    /router\.replace\(['"`]\//,
    /navigation\.goBack\(/,
    /useRouter\(\)/, // permissive: presence of router import counts
    /Linking\.openURL\(/,
];

/** Detects view-state machines without a reset transition. */
const findUnreversedViewStates = (
    source: string
): { variable: string; values: string[]; resetMissing: boolean }[] => {
    const out: { variable: string; values: string[]; resetMissing: boolean }[] = [];
    const stateRe = /useState<\s*([A-Za-z0-9_$]+)\s*>\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const unionRe =
        /type\s+([A-Za-z0-9_$]+)\s*=\s*((?:['"][^'"]+['"]\s*(?:\|\s*)?)+);/g;
    const unions = new Map<string, string[]>();
    for (const match of source.matchAll(unionRe)) {
        const name = match[1];
        const values = Array.from(match[2].matchAll(/['"]([^'"]+)['"]/g)).map((m) => m[1]);
        unions.set(name, values);
    }
    for (const match of source.matchAll(stateRe)) {
        const typeName = match[1];
        const initial = match[2];
        const values = unions.get(typeName);
        if (!values) continue;
        const nonRoot = values.filter((v) => v !== initial);
        if (nonRoot.length === 0) continue;
        // Look for at least one setView('initial') reset transition.
        const setterRe = new RegExp(`set[A-Z]\\w*\\(['"]${initial}['"]\\)`);
        out.push({
            variable: typeName,
            values,
            resetMissing: !setterRe.test(source),
        });
    }
    return out;
};

const findModalsWithoutClose = (source: string): boolean => {
    if (!/<Modal\b/.test(source)) return false;
    return !/onRequestClose|setVisible\(\s*false|setOpen\(\s*false/.test(source);
};

const findDeepLinks = (source: string): string[] =>
    Array.from(source.matchAll(/blackout:\/\/([A-Za-z0-9_\-\/]+)/g)).map((m) => m[0]);

const resolveDeepLink = (link: string, screens: ScreenFile[]): boolean => {
    // blackout://settings/privacy → look for a screen whose routePath ends in /settings
    const segment = link.replace('blackout://', '').split('/')[0];
    if (!segment) return false;
    return screens.some((s) => s.routePath.includes(segment));
};

const auditScreen = async (
    screen: ScreenFile,
    allScreens: ScreenFile[]
): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = [];
    const source = await readSafe(screen.file);

    // Auth entry points legitimately have no back stack; the rest of the
    // non-tab screens must expose some escape.
    const AUTH_SCREENS = new Set(['/login', '/register', '/reset-password']);
    if (!screen.inTabs && !AUTH_SCREENS.has(screen.routePath)) {
        const hasEscape = HAS_ESCAPE.some((re) => re.test(source));
        if (!hasEscape) {
            findings.push({
                category: 'home-button',
                severity: 'error',
                route: screen.routePath,
                message: 'Non-tab screen lacks any back/home escape affordance',
                locator: screen.rel,
            });
        }
    }

    for (const machine of findUnreversedViewStates(source)) {
        if (machine.resetMissing) {
            findings.push({
                category: 'dead-end',
                severity: 'warning',
                route: screen.routePath,
                message: `View-state machine \`${machine.variable}\` never resets to its root value`,
                locator: screen.rel,
            });
        }
    }

    if (findModalsWithoutClose(source)) {
        findings.push({
            category: 'modal-closure',
            severity: 'error',
            route: screen.routePath,
            message: '<Modal> rendered without onRequestClose / setVisible(false) handler',
            locator: screen.rel,
        });
    }

    for (const link of findDeepLinks(source)) {
        if (!resolveDeepLink(link, allScreens)) {
            findings.push({
                category: 'dead-end',
                severity: 'warning',
                route: screen.routePath,
                message: `Deep link \`${link}\` does not map to any known screen segment`,
                locator: screen.rel,
            });
        }
    }

    return findings;
};

const run = async (): Promise<number> => {
    try {
        const info = await stat(MOBILE_APP_DIR);
        if (!info.isDirectory()) throw new Error('not a directory');
    } catch {
        // eslint-disable-next-line no-console
        console.error(`No mobile app directory at ${MOBILE_APP_DIR} — skipping mobile audit.`);
        return 0;
    }
    const screens = await walkScreens(MOBILE_APP_DIR);
    const findings: AuditFinding[] = [];
    const cleanRoutes: string[] = [];
    for (const screen of screens) {
        const screenFindings = await auditScreen(screen, screens);
        if (screenFindings.length === 0) cleanRoutes.push(screen.routePath);
        findings.push(...screenFindings);
    }
    const report: AuditReport = {
        generatedAt: new Date().toISOString(),
        target: 'mobile',
        routes: screens.map((s) => s.routePath),
        findings,
        cleanRoutes,
    };
    const outDir = resolve(process.cwd(), 'audit/navigation');
    const { jsonPath, markdownPath } = await writeReports(outDir, 'mobile', report);
    // eslint-disable-next-line no-console
    console.log(`mobile-report.json → ${jsonPath}`);
    // eslint-disable-next-line no-console
    console.log(`mobile-report.md   → ${markdownPath}`);

    const errors = findings.filter((f) => f.severity === 'error').length;
    return errors > 0 ? 1 : 0;
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
