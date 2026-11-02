#!/usr/bin/env node
/**
 * File-name guard: tracked paths that a case-insensitive filesystem (Windows,
 * and macOS by default) cannot tell apart, and route path literals declared in
 * more than one file. Linux, where most of CI builds, is case-sensitive, so the
 * first two build there and break only where the filesystem is not: the macOS
 * and Windows runners, and developer machines.
 *
 * Three checks, each reported on its own:
 *
 *   1. Whole paths that are equal ignoring case (`src/Foo.ts` beside
 *      `src/foo.ts`, or `a.TS` beside `a.ts`). A case-insensitive checkout
 *      can hold only one of them.
 *   2. Names that, once the last extension is removed, are equal ignoring case
 *      but not exactly (`toolbag.ts` beside `ToolBag.tsx`). Both files check
 *      out, but an import without an extension (`./toolbag/ToolBag`) is tried
 *      as `ToolBag.ts` before `ToolBag.tsx`, and a case-insensitive filesystem
 *      answers with `toolbag.ts`. That pair stopped the client build on the
 *      macOS and Windows runners (desktop build check run 41461043012; fixed
 *      in 9eab8c9) while Linux CI built it. The directory part is compared
 *      ignoring case too, since `src/Foo/` and `src/foo/` are one directory
 *      there. Only the last extension is removed, so `ToolBag.tsx` beside
 *      `ToolBag.css.ts` or `toolbag.css.ts` passes (`ToolBag` against
 *      `ToolBag.css`), and names whose stems are exactly equal (`index.ts`
 *      beside `index.css`) pass, because every filesystem resolves them alike.
 *   3. Absolute route path literals (`path: '/x'`) declared in more than one
 *      source file.
 *
 * Not covered: a file against a sibling directory (`Foo.ts` beside `foo/`),
 * Unicode case folding beyond String.prototype.toLowerCase, and the NFC/NFD
 * normalization that APFS ignores. There is no allowlist: rename one file of
 * a group instead.
 *
 * Run: pnpm guard:duplicate-paths (ci.yml, deployment-readiness job)
 * Test: pnpm test:guard:duplicate-paths
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, posix } from 'node:path';
import { pathToFileURL } from 'node:url';

const textExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export function getTrackedFiles(cwd = process.cwd()) {
    // -z: without it git quotes a path that has a non-ASCII byte, in octal
    // (core.quotePath), and the quoted forms no longer compare by case.
    // maxBuffer: the list is about 390 KB today; the default is 1 MiB.
    const out = execFileSync('git', ['ls-files', '-z'], {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\0').filter(Boolean);
}

export function checkCaseInsensitivePathCollisions(files) {
    const byLower = new Map();
    for (const file of files) {
        const key = file.toLowerCase();
        const bucket = byLower.get(key) ?? [];
        bucket.push(file);
        byLower.set(key, bucket);
    }

    return [...byLower.values()].filter((group) => group.length > 1);
}

// `ToolBag.css.ts` -> `ToolBag.css`, `.eslintrc.cjs` -> `.eslintrc`,
// `.eslintrc` and `Makefile` unchanged (Node's extname).
export function nameWithoutLastExtension(name) {
    const ext = posix.extname(name);
    return ext ? name.slice(0, -ext.length) : name;
}

// Check 2 above. Each group lists every file whose directory and stem match
// ignoring case, when at least two of them do not match exactly.
export function findCaseOnlyNameCollisions(files) {
    const groups = new Map();
    for (const file of files) {
        const stemPath = `${posix.dirname(file)}/${nameWithoutLastExtension(posix.basename(file))}`;
        const key = stemPath.toLowerCase();
        const group = groups.get(key) ?? { stemPaths: new Set(), files: [] };
        group.stemPaths.add(stemPath);
        group.files.push(file);
        groups.set(key, group);
    }

    return [...groups.values()]
        .filter((group) => group.stemPaths.size > 1)
        .map((group) => [...group.files].sort());
}

function isTestLikeFile(file) {
    return (
        file.includes('/tests/') ||
        file.includes('/test/') ||
        /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
    );
}

// Files where multiple `path:` literals at the same value are expected
// (audit tooling re-enumerates app routes; client SDKs share a resource
// path across multiple HTTP methods).
const SCAN_SKIP_PREFIXES = ['tools/audit-navigation/', 'packages/blackout-sdk/'];

function shouldSkipFile(file) {
    if (!textExtensions.has(extname(file)) || isTestLikeFile(file)) return true;
    return SCAN_SKIP_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function collectRoutePathLiterals(files) {
    // Track unique (path, file) pairs so multiple same-path entries inside one
    // file (e.g. different HTTP methods on the same resource) don't count as
    // duplicates — only collisions across distinct files do.
    const routeLiterals = new Map();

    const patterns = [/\bpath\s*:\s*(["'`])([^"'`]+)\1/g, /\bpath\s*=\s*(["'])([^"']+)\1/g];

    for (const file of files) {
        if (shouldSkipFile(file)) continue;

        const content = readFileSync(file, 'utf8');
        for (const pattern of patterns) {
            for (const match of content.matchAll(pattern)) {
                const value = match[2]?.trim();
                if (!value || !value.startsWith('/')) continue;

                const filesForPath = routeLiterals.get(value) ?? new Set();
                filesForPath.add(file);
                routeLiterals.set(value, filesForPath);
            }
        }
    }

    return [...routeLiterals.entries()]
        .map(([path, filesForPath]) => ({ path, occurrences: [...filesForPath] }))
        .filter(({ occurrences }) => occurrences.length > 1);
}

function printError(message) {
    console.error(`❌ ${message}`);
}

function printOk(message) {
    console.log(`✅ ${message}`);
}

export function runCli() {
    const files = getTrackedFiles();

    const pathCollisions = checkCaseInsensitivePathCollisions(files);
    const nameCollisions = findCaseOnlyNameCollisions(files);
    const duplicateRoutePaths = collectRoutePathLiterals(files);

    if (pathCollisions.length === 0) {
        printOk('No case-insensitive file path collisions found.');
    } else {
        printError('Case-insensitive file path collisions found:');
        for (const group of pathCollisions) {
            console.error(`  - ${group.join('  <->  ')}`);
        }
    }

    if (nameCollisions.length === 0) {
        printOk('No case-only file name collisions found.');
    } else {
        printError(
            'File names that differ only by case once the last extension is removed ' +
                '(an import without an extension can find the wrong one on macOS or Windows):'
        );
        for (const group of nameCollisions) {
            console.error(`  - ${group.join('  <->  ')}`);
        }
        console.error('  Rename one file of each group; there is no allowlist.');
    }

    if (duplicateRoutePaths.length === 0) {
        printOk('No duplicate absolute route path literals found.');
    } else {
        printError('Duplicate absolute route path literals found:');
        for (const { path, occurrences } of duplicateRoutePaths) {
            console.error(`  - ${path}`);
            for (const file of occurrences) {
                console.error(`      • ${file}`);
            }
        }
    }

    if (pathCollisions.length > 0 || nameCollisions.length > 0 || duplicateRoutePaths.length > 0) {
        process.exit(1);
    }
}

// Only run the repository-wide scan when invoked directly, so the test can
// import the pure functions without triggering it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCli();
}
