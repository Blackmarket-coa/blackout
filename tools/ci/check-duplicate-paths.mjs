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
 *      case-insensitive checkout writes both directories' files into one,
 *      and git may not show it: clone sets core.ignoreCase on such a
 *      filesystem, and git then takes a name in another case for the
 *      tracked one (from git-config's documentation; no case-insensitive
 *      filesystem was available to try it). Checks 1 to 3 see such a pair
 *      only when two of its files collide (`src/Foo/bar.ts` beside
 *      `src/foo/Bar.tsx`). A checkout hazard rather than a build fault: an
 *      import that resolves on macOS but not on Linux fails Linux CI first.
 *   5. Absolute route path literals (`path: '/x'`) declared in more than one
 *      source file.
 *
 * Not covered: a file against a sibling directory (`Foo.ts` beside `foo/`);
 * an upper-case extension beside a sibling with the same stem (`a.TS` beside
 * `a.tsx`: `./a` is probed as `a.ts`, which matches `a.TS` only on a
 * case-insensitive filesystem; the stems are exactly equal and the whole
 * names differ, so checks 1 to 3 all pass it, and catching it would take the
 * resolver's probe order); a resolver suffix with more than one dot beside a
 * name in another case (`Foo.d.ts` beside `foo.ts`: TypeScript probes
 * `./Foo` as `Foo.ts`, `Foo.tsx`, then `Foo.d.ts`, so a type-only import
 * finds `Foo.d.ts` on Linux and `foo.ts` where case does not matter, which
 * only a type check there shows, since the bundler erases the import; the
 * stems `Foo.d` and `foo` differ and neither whole name is the other's
 * stem, so this too would take the probe order); Unicode case folding beyond
 * String.prototype.toLowerCase; and the NFC/NFD normalization that APFS
 * ignores. There is no allowlist: rename one file of a group instead.
 *
 * Run: pnpm guard:duplicate-paths (ci.yml, deployment-readiness job)
 * Test: pnpm test:guard:duplicate-paths
 *
 * The checks themselves are in ./duplicate-paths-rules.mjs, which runs
 * nothing when imported; the test imports that module. This file runs the
 * scan whenever it is loaded, however it is loaded, so there is no
 * main-module question for it to get wrong (through a symlink, under
 * --import, or with a process.argv[1] that names no file). And it scans the
 * whole repository from whatever directory it is started in: it finds the
 * top level with `git rev-parse --show-toplevel` and lists and reads every
 * tracked path from there, since `git ls-files` alone lists only the paths
 * under the directory it runs in. So no way of starting it can skip the
 * scan, or scan only part of the tree, and exit 0. Nothing should import it.
 */
import {
    checkCaseInsensitivePathCollisions,
    collectRoutePathLiterals,
    findCaseOnlyDirectoryCollisions,
    findCaseOnlyNameCollisions,
    findNameAgainstStemCollisions,
    getRepositoryRoot,
    getTrackedFiles,
} from './duplicate-paths-rules.mjs';

function printError(message) {
    console.error(`❌ ${message}`);
}

function printOk(message) {
    console.log(`✅ ${message}`);
}

function runCli() {
    const root = getRepositoryRoot();
    const files = getTrackedFiles(root);

    const pathCollisions = checkCaseInsensitivePathCollisions(files);
    const nameCollisions = findCaseOnlyNameCollisions(files);
    const stemCollisions = findNameAgainstStemCollisions(files);
    const directoryCollisions = findCaseOnlyDirectoryCollisions(files);
    const duplicateRoutePaths = collectRoutePathLiterals(files, root);

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

runCli();
