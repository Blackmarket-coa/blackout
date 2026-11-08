/**
 * The checks of tools/ci/check-duplicate-paths.mjs, whose header says what
 * each one catches and why. This module has no side effects, so the test
 * (check-duplicate-paths.test.mjs) can import it; the script imports it and
 * runs the scan.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, posix } from 'node:path';

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

// The path with the name's last extension removed: `x/ToolBag.css.ts` ->
// `x/ToolBag.css`, and `Foo.md` at the root -> `Foo` (no `./`, so that it
// compares with the paths `git ls-files` prints).
function stemPathOf(file) {
    const dir = posix.dirname(file);
    const stem = nameWithoutLastExtension(posix.basename(file));
    return dir === '.' ? stem : `${dir}/${stem}`;
}

// Check 2 in the header of check-duplicate-paths.mjs. Each group lists
// every file whose directory and stem match ignoring case, when at least two
// of them do not match exactly.
export function findCaseOnlyNameCollisions(files) {
    const groups = new Map();
    for (const file of files) {
        const stemPath = stemPathOf(file);
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

// Check 3 in the header of check-duplicate-paths.mjs. Each pair is a file
// with an extension and the sibling whose whole path equals that file's stem
// path ignoring case but not exactly. A file without an extension is its own
// stem, so it is left to check 1.
export function findNameAgainstStemCollisions(files) {
    const byLowerPath = new Map();
    for (const file of files) {
        const key = file.toLowerCase();
        const bucket = byLowerPath.get(key) ?? [];
        bucket.push(file);
        byLowerPath.set(key, bucket);
    }

    const pairs = [];
    for (const file of files) {
        const stemPath = stemPathOf(file);
        if (stemPath === file) continue;
        for (const sibling of byLowerPath.get(stemPath.toLowerCase()) ?? []) {
            if (sibling !== stemPath) pairs.push([file, sibling].sort());
        }
    }
    return pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// Check 4 in the header of check-duplicate-paths.mjs. Every directory on the
// way to a tracked file (`a/b/c.ts` gives `a` and `a/b`), grouped ignoring
// case; each group with more than one spelling is returned, its spellings
// sorted. `a/B/c/x.ts` beside `a/b/C/y.ts` gives two groups, one per level
// that differs.
export function findCaseOnlyDirectoryCollisions(files) {
    const byLower = new Map();
    for (const file of files) {
        for (let dir = posix.dirname(file); dir !== '.'; dir = posix.dirname(dir)) {
            const key = dir.toLowerCase();
            const spellings = byLower.get(key) ?? new Set();
            spellings.add(dir);
            byLower.set(key, spellings);
        }
    }

    return [...byLower.values()]
        .filter((spellings) => spellings.size > 1)
        .map((spellings) => [...spellings].sort())
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
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

export function collectRoutePathLiterals(files) {
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
