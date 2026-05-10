#!/usr/bin/env node
// Aggregates security advisories from upstream projects that BMC maintains
// forks of, per AGGRESSIVE_OPERATIONS_GUIDE.md §2.9 and §8.3, and appends
// new rows to docs/operations/UPSTREAM_ADVISORIES.md.
//
// New rows are written with Classification=needs-review; the
// AI_SECURITY_WORKFLOW.md classification step reclassifies them to
// applicable / not-applicable.
//
// Usage:
//   GITHUB_TOKEN=ghp_... node tools/ci/fetch-upstream-advisories.mjs
//   GITHUB_TOKEN=ghp_... node tools/ci/fetch-upstream-advisories.mjs --dry-run
//
// Exit codes:
//   0 — success (file may or may not have changed)
//   1 — fatal error (network, auth, malformed file)
//
// Designed to be invoked by .github/workflows/upstream-advisories.yml.

import { readFile, writeFile } from 'node:fs/promises';
import { argv, env, exit } from 'node:process';

export const ADVISORIES_PATH = 'docs/operations/UPSTREAM_ADVISORIES.md';
export const TABLE_HEADER_MARKER = '| Date | Project | Advisory ID | URL | Classification | BMC patch | Reviewer |';
export const EMPTY_ROW_MARKER = '| _(empty)_ | | | | | | |';
const DRY_RUN = argv.includes('--dry-run');

// Watched upstream repositories — matches AGGRESSIVE_OPERATIONS_GUIDE.md §2.9.
// `slug` is the GitHub owner/repo. `display` is the column label used in the
// advisories table. Adjust here if an upstream project moves orgs.
const WATCHED = [
    { slug: 'cinnyapp/cinny',     display: 'Cinny' },
    { slug: 'element-hq/synapse', display: 'Synapse' },
    { slug: 'medusajs/medusa',    display: 'MedusaJS' },
    { slug: 'mercurjs/MercurJS',  display: 'MercurJS' },
    { slug: 'fleetbase/fleetbase', display: 'Fleetbase' },
];

function authHeaders() {
    const token = env.GITHUB_TOKEN;
    if (!token) {
        console.error('error: GITHUB_TOKEN is not set');
        exit(1);
    }
    return {
        'accept': 'application/vnd.github+json',
        'authorization': `Bearer ${token}`,
        'user-agent': 'bmc-upstream-advisories/1.0',
        'x-github-api-version': '2022-11-28',
    };
}

async function fetchAdvisories(slug, headers) {
    // Pulls *published* repository security advisories. Drafts are not
    // returned to non-collaborators. The endpoint paginates; we cap at the
    // first page (30 results) — anything older than the last 30 advisories
    // is already in the markdown table or has been classified out.
    const url = `https://api.github.com/repos/${slug}/security-advisories?state=published&per_page=30`;
    const res = await fetch(url, { headers });
    if (res.status === 404) {
        // Repo doesn't publish advisories on GitHub — not an error.
        console.error(`note: ${slug} does not expose /security-advisories (404)`);
        return [];
    }
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`github api ${slug}: ${res.status} ${res.statusText}\n${body}`);
    }
    return await res.json();
}

export function parseExistingIds(markdown) {
    // Extract advisory IDs already present in the table so we don't append
    // duplicates. Matches both GHSA-* and CVE-* patterns in the third column.
    const ids = new Set();
    const re = /\|\s*\d{4}-\d{2}-\d{2}\s*\|[^|]*\|\s*([^\s|]+)\s*\|/g;
    for (const match of markdown.matchAll(re)) {
        ids.add(match[1].trim());
    }
    return ids;
}

function escapePipe(s) {
    return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function rowFor(advisory, projectDisplay) {
    const date = (advisory.published_at || advisory.updated_at || new Date().toISOString()).slice(0, 10);
    const id = advisory.ghsa_id || advisory.cve_id || '(unknown)';
    const url = advisory.html_url || '';
    return `| ${date} | ${escapePipe(projectDisplay)} | ${id} | ${url} | needs-review | _(pending)_ | _(automation)_ |`;
}

export function insertRows(markdown, newRows) {
    if (newRows.length === 0) return markdown;
    const lines = markdown.split('\n');
    const headerIdx = lines.findIndex((l) => l.trim() === TABLE_HEADER_MARKER);
    if (headerIdx === -1) {
        throw new Error(`could not find table header in ${ADVISORIES_PATH}`);
    }
    // The row directly under the header row is the alignment row
    // (`|------|...`). Body rows start two lines below the header.
    const bodyStart = headerIdx + 2;

    // If the body currently holds only the empty-row marker, replace it.
    if (lines[bodyStart]?.trim() === EMPTY_ROW_MARKER) {
        lines.splice(bodyStart, 1, ...newRows);
    } else {
        lines.splice(bodyStart, 0, ...newRows);
    }
    return lines.join('\n');
}

async function main() {
    const headers = authHeaders();
    const markdown = await readFile(ADVISORIES_PATH, 'utf8');
    const existingIds = parseExistingIds(markdown);

    const newRows = [];
    let totalFetched = 0;
    let failedRepos = 0;

    for (const repo of WATCHED) {
        let advisories;
        try {
            advisories = await fetchAdvisories(repo.slug, headers);
        } catch (err) {
            console.error(`error: ${repo.slug}: ${err.message}`);
            failedRepos += 1;
            continue;
        }
        totalFetched += advisories.length;
        for (const adv of advisories) {
            const id = adv.ghsa_id || adv.cve_id;
            if (!id) continue;
            if (existingIds.has(id)) continue;
            newRows.push(rowFor(adv, repo.display));
            existingIds.add(id);
        }
    }

    console.log(`fetched ${totalFetched} advisories across ${WATCHED.length} repos; ${newRows.length} new; ${failedRepos} failed`);

    if (failedRepos === WATCHED.length) {
        // All repos failed — almost certainly auth or network. Surface as
        // a workflow alarm rather than a silent no-op.
        throw new Error('all watched repos failed; see errors above');
    }

    if (newRows.length === 0) {
        // Idempotent: no work, exit clean. Workflow will not commit.
        return;
    }

    const updated = insertRows(markdown, newRows);
    if (DRY_RUN) {
        console.log('--dry-run: would write the following new rows:');
        for (const row of newRows) console.log(row);
        return;
    }
    await writeFile(ADVISORIES_PATH, updated, 'utf8');
    console.log(`wrote ${newRows.length} new rows to ${ADVISORIES_PATH}`);
}

// Only run main() when invoked directly; allow tests to import the
// pure helpers without triggering the network and the GITHUB_TOKEN
// guard above (which gates on import-time module load).
const invokedDirectly = import.meta.url === `file://${argv[1]}`;
if (invokedDirectly) {
    main().catch((err) => {
        console.error(`fatal: ${err.message}`);
        exit(1);
    });
}
