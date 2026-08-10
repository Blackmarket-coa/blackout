#!/usr/bin/env node
/**
 * Fails when `apps/` or `packages/` import runtime code out of `legacy/` or
 * `_port/`. Those trees are retained for reference, not for the active path.
 *
 * Two things this has to get right, both of which it previously got wrong:
 *
 * 1. `legacy` must match a whole PATH SEGMENT, not a substring. The old
 *    pattern was `from ['"].*(legacy|_port)`, which flagged
 *    `from './legacyThemePlugin'` — a perfectly ordinary local module in
 *    `src/app/plugins/theme/` whose only sin is being named after the legacy
 *    themes it provides. A guard that fires on correct code teaches people to
 *    ignore it, or worse, to rename good files to appease it.
 *
 * 2. It must not scan build output. ripgrep did not skip the gitignored
 *    `apps/blackout-client/coverage/` tree here, so anyone who had run
 *    `test:coverage` got extra hits from generated lcov HTML echoing the
 *    source it was reporting on. The excludes below make that deterministic
 *    rather than dependent on ripgrep's ignore handling.
 */
import { spawnSync } from 'node:child_process';

/**
 * Matches an import/export specifier where `legacy` or `_port` is a complete
 * path segment: `'legacy/x'`, `'../legacy'`, `'../../legacy/blackout-web/x'`.
 * Does not match `'./legacyThemePlugin'`, because the segment there is
 * `legacyThemePlugin`, not `legacy`.
 */
const SPECIFIER = `(?:[^'"]*/)?(?:legacy|_port)(?:/[^'"]*)?`;
const PATTERN = `(?:from|import\\(|require\\()\\s*['"]${SPECIFIER}['"]`;

const EXCLUDES = [
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/.turbo/**',
    '!**/*.snap',
];

const result = spawnSync(
    'rg',
    ['-n', ...EXCLUDES.flatMap((glob) => ['--glob', glob]), PATTERN, 'apps', 'packages'],
    { encoding: 'utf8' }
);

if (result.status !== 1 && result.status !== 0) {
    console.error(
        `Legacy isolation check failed to execute ripgrep. stderr: ${result.stderr || '<none>'}`
    );
    process.exit(1);
}

if (result.status === 0) {
    console.error('Legacy isolation check failed. Runtime imports from legacy paths were found:');
    console.error(result.stdout.trim());
    process.exit(1);
}

console.log(
    'Legacy isolation check passed. No runtime imports from legacy/_port paths in apps/ or packages/.'
);
