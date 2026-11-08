#!/usr/bin/env node
/**
 * File-name guard: tracked paths that a case-insensitive filesystem (Windows,
 * and macOS by default) cannot tell apart, and route path literals declared in
 * more than one file. Linux, where most of CI builds, is case-sensitive, so the
 * first three build there and break only where the filesystem is not: the
 * macOS and Windows runners, and developer machines.
 *
 * Five checks, each reported on its own:
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
 *      `ToolBag.css`). Names whose stems are exactly equal (`index.ts` beside
 *      `index.css`) pass this check: the probes for `./index` find the same
 *      file on every filesystem as long as both extensions are lower case
 *      (`a.TS` beside `a.tsx` is under Not covered).
 *   3. A whole name that equals a sibling's name without its last extension,
 *      ignoring case but not exactly (`foo.css` beside `Foo.css.ts`). The
 *      client imports vanilla-extract styles as `./Foo.css`; Vite stats that
 *      path as written before it tries any extension, so the import finds
 *      `Foo.css.ts` on Linux and `foo.css` on macOS or Windows, and a named
 *      import then fails there as the tool-bag pair did. `Foo.css` beside
 *      `Foo.css.ts` passes: the exact name wins on every filesystem.
 *   4. Two directories whose paths are equal ignoring case but not exactly
 *      (`src/Foo/` beside `src/foo/`), whatever their files are called. A
 *      case-insensitive checkout writes both directories' files into one and
 *      git then reports the other spelling's files as deleted, with the
 *      checkout's as untracked. Checks 1 to 3 see such a pair only when two
 *      of its files collide (`src/Foo/bar.ts` beside `src/foo/Bar.tsx`). A
 *      checkout hazard rather than a build fault: an import that resolves on
 *      macOS but not on Linux fails Linux CI first.
 *   5. Absolute route path literals (`path: '/x'`) declared in more than one
 *      source file.
 *
 * Not covered: a file against a sibling directory (`Foo.ts` beside `foo/`);
 * an upper-case extension beside a sibling with the same stem (`a.TS` beside
 * `a.tsx`: `./a` is probed as `a.ts`, which matches `a.TS` only on a
 * case-insensitive filesystem; the stems are exactly equal and the whole
 * names differ, so checks 1 to 3 all pass it, and catching it would take the
 * resolver's probe order); Unicode case folding beyond
 * String.prototype.toLowerCase; and the NFC/NFD normalization that APFS
 * ignores. There is no allowlist: rename one file of a group instead.
 *
 * Run: pnpm guard:duplicate-paths (ci.yml, deployment-readiness job)
 * Test: pnpm test:guard:duplicate-paths
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { extname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Check 2 above. Each group lists every file whose directory and stem match
// ignoring case, when at least two of them do not match exactly.
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

// Check 3 above. Each pair is a file with an extension and the sibling whose
// whole path equals that file's stem path ignoring case but not exactly. A
// file without an extension is its own stem, so it is left to check 1.
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

// Check 4 above. Every directory on the way to a tracked file (`a/b/c.ts`
// gives `a` and `a/b`), grouped ignoring case; each group with more than one
// spelling is returned, its spellings sorted. `a/B/c/x.ts` beside
// `a/b/C/y.ts` gives two groups, one per level that differs.
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
    const stemCollisions = findNameAgainstStemCollisions(files);
    const directoryCollisions = findCaseOnlyDirectoryCollisions(files);
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

    if (stemCollisions.length === 0) {
        printOk('No file name equals a sibling name without its last extension by case alone.');
    } else {
        printError(
            "File names where one equals a sibling's name without its last extension, " +
                'ignoring case but not exactly (an import of that name finds the wrong file on macOS or Windows):'
        );
        for (const pair of stemCollisions) {
            console.error(`  - ${pair.join('  <->  ')}`);
        }
        console.error('  Rename one file of each pair; there is no allowlist.');
    }

    if (directoryCollisions.length === 0) {
        printOk('No directory paths that differ only by case found.');
    } else {
        printError(
            'Directory paths that differ only by case ' +
                '(a case-insensitive checkout writes their files into one directory):'
        );
        for (const group of directoryCollisions) {
            console.error(`  - ${group.map((dir) => `${dir}/`).join('  <->  ')}`);
        }
        console.error('  Rename one directory of each group; there is no allowlist.');
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

    if (
        pathCollisions.length > 0 ||
        nameCollisions.length > 0 ||
        stemCollisions.length > 0 ||
        directoryCollisions.length > 0 ||
        duplicateRoutePaths.length > 0
    ) {
        process.exit(1);
    }
}

// Only run the repository-wide scan when invoked directly, so the test can
// import the pure functions without triggering it. Both sides are real paths:
// the ESM loader resolves symlinks in import.meta.url, while process.argv[1]
// keeps the path as given, so comparing the two as given would skip the scan,
// and exit 0, whenever the script is called through a symlinked path. When
// process.argv[1] names nothing that can be resolved (`node --import` of this
// file ahead of a main module that does not exist), the question has no
// answer, and the script fails rather than exit 0 with nothing scanned.
// import.meta.main would answer it, but it exists only since Node 22.18 and
// package.json's engines allow 22.11, where undefined would read as "not the
// main module": the same silent pass. With no main script file at all
// (node -e or -p, which run no file of their own) the file was imported, so
// the scan does not run; piping this file to node lands here too, and is not
// a way the guard is run.
function isInvokedDirectly() {
    if (!process.argv[1]) return false;
    let invokedPath;
    try {
        invokedPath = realpathSync(process.argv[1]);
    } catch (error) {
        printError(
            `Cannot resolve process.argv[1] (${process.argv[1]}): ${error.message}. ` +
                'Whether this script was invoked directly is unknown, so nothing was ' +
                'scanned; this is a failure, not a pass.'
        );
        process.exit(1);
    }
    return invokedPath === fileURLToPath(import.meta.url);
}

if (isInvokedDirectly()) {
    runCli();
}
