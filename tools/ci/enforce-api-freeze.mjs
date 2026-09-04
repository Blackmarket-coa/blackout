import { execFileSync } from 'node:child_process';

const ALLOWED_FILES = new Set([
    'packages/api/src/index.ts',
    // Polls a third-party Owncast server's public `/api/status`, not Blackout's
    // own frozen `/api` namespace. `isExternalApiReference` below only spots an
    // external URL when `://` is literal on the line, and here the origin is
    // interpolated from config — so the guard cannot tell the difference. This
    // exempts the whole file, which is acceptable only because it does nothing
    // but poll that one external endpoint.
    'packages/api/src/services/owncastMetricsScheduler.ts',
]);

const ALLOWED_PREFIXES = ['docs/api/'];

function isAllowedFile(file) {
    if (ALLOWED_FILES.has(file)) return true;
    return ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function isExternalApiReference(content) {
    return /:\/\/[^\s'"`]*\/api\//.test(content);
}

function isCommentLine(content) {
    return /^\s*(\*|\/\/|--|#)/.test(content);
}

const scanPaths = ['packages/api/src', 'packages/contracts/src', 'docs/api'];
const output = execFileSync('rg', ['-n', '/api/', ...scanPaths], { encoding: 'utf8' });
const lines = output.split('\n').filter(Boolean);

const violations = lines.filter((line) => {
    const colon1 = line.indexOf(':');
    const colon2 = line.indexOf(':', colon1 + 1);
    if (colon1 === -1 || colon2 === -1) return true;
    const file = line.slice(0, colon1);
    const content = line.slice(colon2 + 1);

    if (isAllowedFile(file)) return false;
    if (isExternalApiReference(content)) return false;
    if (isCommentLine(content)) return false;
    return true;
});

if (violations.length) {
    console.error('API freeze violation: new /api references found outside allowlist.');
    for (const violation of violations) {
        console.error(`- ${violation}`);
    }
    process.exit(1);
}

console.log('API freeze check passed.');
