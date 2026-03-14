#!/usr/bin/env node
/*
Monthly docs integrity validation for centralized release tracking.
*/

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CANONICAL_STATUSES = new Set(['Complete', 'In progress', 'Partial', 'Blocked']);

const TRACKER_FILES = [
    'docs/project_completion_tracker.md',
    'docs/blackout-governance-completion-tracker.md',
    'docs/blackout-reuse-completion-tracker.md',
    'docs/rollout-readiness-status.md',
];

const SCHEMA_REQUIRED_PATTERNS = [
    { pattern: /\bStatus\b/i, label: 'status field' },
    { pattern: /\bEvidence\b/i, label: 'evidence field' },
    { pattern: /\bOwner\b/i, label: 'owner field' },
    { pattern: /Next review date/i, label: 'next review date field' },
    { pattern: /\bRemaining\b/i, label: 'remaining work/follow-up field' },
];

const UNFINISHED_MARKER_FILES = [
    'docs/unfinished-code-checklist.md',
    'docs/project_completion_tracker.md',
    'docs/blackout_centralized_release_readiness_gate.md',
];

const EVIDENCE_REF_SCAN_FILES = [
    'docs/project_completion_tracker.md',
    'docs/blackout-governance-completion-tracker.md',
    'docs/blackout-reuse-completion-tracker.md',
    'docs/blackout_centralized_build_work_order.md',
    'docs/blackout_centralized_release_readiness_gate.md',
    'docs/unfinished-code-priority-plan.md',
    'docs/ai-prompts-remaining-work.md',
    'docs/operations/tracker_evidence_matrix.md',
    'docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md',
];

function readFile(repoPath) {
    const absolute = path.resolve(REPO_ROOT, repoPath);
    return fs.readFileSync(absolute, 'utf8');
}

function collectStatusValues(markdown) {
    const statuses = [];
    const lines = markdown.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const statusLine = line.match(/^\s*Status:\s*(.+?)\s*$/i);
        if (statusLine) {
            statuses.push({ value: statusLine[1].trim(), line: i + 1, source: 'status_line' });
        }
    }

    // Parse markdown tables and read explicit "Status" columns.
    for (let i = 0; i < lines.length; i += 1) {
        const header = lines[i];
        const divider = lines[i + 1];
        if (!header || !divider || !header.includes('|') || !divider.includes('|')) continue;
        if (!/^\s*\|?\s*[-:| ]+\|\s*$/.test(divider)) continue;

        const headers = splitTableRow(header);
        const statusIndex = headers.findIndex((h) => h.toLowerCase() === 'status');
        if (statusIndex === -1) continue;

        let row = i + 2;
        while (row < lines.length && lines[row].includes('|')) {
            if (!lines[row].trim() || /^\s*\|?\s*[-:| ]+\|\s*$/.test(lines[row])) break;
            const cells = splitTableRow(lines[row]);
            if (statusIndex < cells.length && cells[statusIndex].trim()) {
                statuses.push({ value: cells[statusIndex].trim(), line: row + 1, source: 'status_table' });
            }
            row += 1;
        }
    }

    return statuses;
}

function splitTableRow(row) {
    return row
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
}

function validateCanonicalStatuses(filePath, markdown) {
    const violations = [];
    for (const status of collectStatusValues(markdown)) {
        if (!CANONICAL_STATUSES.has(status.value)) {
            violations.push(
                `${filePath}:${status.line} invalid status \"${status.value}\" (${status.source}); expected one of: ${[
                    ...CANONICAL_STATUSES,
                ].join(', ')}`,
            );
        }
    }
    return violations;
}

function validateTrackerSchemaFields(filePath, markdown) {
    const violations = [];
    for (const requirement of SCHEMA_REQUIRED_PATTERNS) {
        if (!requirement.pattern.test(markdown)) {
            violations.push(
                `${filePath} missing required tracker schema field pattern: ${requirement.pattern} (${requirement.label})`,
            );
        }
    }
    return violations;
}

function extractOpenMarkerCount(filePath, markdown) {
    const patterns = [
        /Open items:\s*\*\*(\d+)\*\*/i,
        /open marker inventory:\s*(\d+)/i,
        /backlog remains high \((\d+)\)/i,
    ];

    for (const pattern of patterns) {
        const match = markdown.match(pattern);
        if (match) {
            return Number(match[1]);
        }
    }

    throw new Error(`${filePath} missing unfinished-marker count pattern (expected Open items/open marker inventory/backlog remains high).`);
}

function validateUnfinishedMarkerSynchronization(filesToContents) {
    const counts = [];
    for (const [filePath, markdown] of Object.entries(filesToContents)) {
        counts.push({ filePath, count: extractOpenMarkerCount(filePath, markdown) });
    }

    const distinct = [...new Set(counts.map((c) => c.count))];
    if (distinct.length <= 1) return [];

    const details = counts.map((c) => `${c.filePath}=${c.count}`).join(', ');
    return [
        `unfinished-marker counts are not synchronized across docs (${details}). Update these docs to the same value in one change set.`,
    ];
}

function findEvidenceReferences(filePath, markdown) {
    const refs = [];
    const lines = markdown.split(/\r?\n/);
    const refRegex = /(docs\/operations\/evidence\/[A-Za-z0-9._-]+\.md)/g;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        let match;
        while ((match = refRegex.exec(line)) !== null) {
            refs.push({ ref: match[1], line: i + 1 });
        }
    }

    return refs;
}

function validateEvidenceReferences(filePath, markdown) {
    const violations = [];
    const refs = findEvidenceReferences(filePath, markdown);
    for (const entry of refs) {
        const absolute = path.resolve(REPO_ROOT, entry.ref);
        if (!fs.existsSync(absolute)) {
            violations.push(
                `${filePath}:${entry.line} stale evidence reference \"${entry.ref}\" (file does not exist). Remove or correct the reference.`,
            );
        }
    }
    return violations;
}

function runIntegrityChecks() {
    const errors = [];

    for (const trackerFile of TRACKER_FILES) {
        const content = readFile(trackerFile);
        errors.push(...validateCanonicalStatuses(trackerFile, content));
        errors.push(...validateTrackerSchemaFields(trackerFile, content));
    }

    const countPayload = {};
    for (const markerFile of UNFINISHED_MARKER_FILES) {
        countPayload[markerFile] = readFile(markerFile);
    }
    errors.push(...validateUnfinishedMarkerSynchronization(countPayload));

    for (const scanFile of EVIDENCE_REF_SCAN_FILES) {
        const content = readFile(scanFile);
        errors.push(...validateEvidenceReferences(scanFile, content));
    }

    return errors;
}

if (require.main === module) {
    const errors = runIntegrityChecks();
    if (errors.length > 0) {
        console.error('Docs integrity check failed with actionable issues:');
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exit(1);
    }

    console.log('Docs integrity check OK: statuses, schema fields, marker counts, and evidence references are valid.');
}

module.exports = {
    collectStatusValues,
    extractOpenMarkerCount,
    findEvidenceReferences,
    runIntegrityChecks,
    validateCanonicalStatuses,
    validateEvidenceReferences,
    validateTrackerSchemaFields,
    validateUnfinishedMarkerSynchronization,
};
