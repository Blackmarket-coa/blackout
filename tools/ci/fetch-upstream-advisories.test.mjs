import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseExistingIds,
    insertRows,
    rowFor,
    TABLE_HEADER_MARKER,
    EMPTY_ROW_MARKER,
} from './fetch-upstream-advisories.mjs';

const TEMPLATE = `# Upstream Security Advisories

Some preamble.

## Advisories

${TABLE_HEADER_MARKER}
|------|---------|-------------|-----|----------------|-----------|----------|
${EMPTY_ROW_MARKER}

The table is initialised empty.
`;

test('parseExistingIds returns empty set for fresh template', () => {
    assert.deepEqual(parseExistingIds(TEMPLATE), new Set());
});

test('parseExistingIds extracts GHSA and CVE ids from existing rows', () => {
    const populated = TEMPLATE.replace(
        EMPTY_ROW_MARKER,
        [
            '| 2026-04-01 | Synapse | GHSA-xxxx-yyyy-zzzz | https://example.test/a | applicable | _(pending)_ | maintainer |',
            '| 2026-03-15 | Cinny | CVE-2026-12345 | https://example.test/b | not-applicable | n/a | ai-tool |',
        ].join('\n'),
    );
    const ids = parseExistingIds(populated);
    assert.ok(ids.has('GHSA-xxxx-yyyy-zzzz'));
    assert.ok(ids.has('CVE-2026-12345'));
    assert.equal(ids.size, 2);
});

test('insertRows replaces empty marker with first batch', () => {
    const row = rowFor(
        { ghsa_id: 'GHSA-aaaa-bbbb-cccc', published_at: '2026-05-01T00:00:00Z', html_url: 'https://example.test/a' },
        'Synapse',
    );
    const updated = insertRows(TEMPLATE, [row]);
    assert.ok(!updated.includes(EMPTY_ROW_MARKER), 'empty marker should be replaced');
    assert.ok(updated.includes('GHSA-aaaa-bbbb-cccc'), 'new row should be present');
});

test('insertRows prepends to existing body rows so newest is at top', () => {
    const oldRow = '| 2026-03-15 | Cinny | GHSA-old-old-old | https://example.test/old | applicable | _(pending)_ | maintainer |';
    const populated = TEMPLATE.replace(EMPTY_ROW_MARKER, oldRow);

    const newRow = rowFor(
        { ghsa_id: 'GHSA-new-new-new', published_at: '2026-05-01T00:00:00Z', html_url: 'https://example.test/new' },
        'Synapse',
    );
    const updated = insertRows(populated, [newRow]);

    const newIdx = updated.indexOf('GHSA-new-new-new');
    const oldIdx = updated.indexOf('GHSA-old-old-old');
    assert.ok(newIdx >= 0 && oldIdx >= 0, 'both rows must be present');
    assert.ok(newIdx < oldIdx, 'newer row must appear before older row');
});

test('insertRows is a no-op when no rows are passed', () => {
    assert.equal(insertRows(TEMPLATE, []), TEMPLATE);
});

test('rowFor produces a needs-review row with correct shape', () => {
    const row = rowFor(
        { ghsa_id: 'GHSA-1234-5678-9abc', published_at: '2026-05-08T12:00:00Z', html_url: 'https://example.test/x' },
        'MedusaJS',
    );
    assert.match(row, /^\| 2026-05-08 \| MedusaJS \| GHSA-1234-5678-9abc \| https:\/\/example\.test\/x \| needs-review \| /);
});

test('rowFor escapes pipe characters that would break the table', () => {
    const row = rowFor(
        { ghsa_id: 'GHSA-1', published_at: '2026-05-08T00:00:00Z', html_url: 'https://example.test/' },
        'Pipe|Project',
    );
    assert.ok(row.includes('Pipe\\|Project'), 'pipe characters in display name must be escaped');
});

test('rowFor falls back to cve_id when ghsa_id is missing', () => {
    const row = rowFor(
        { cve_id: 'CVE-2026-99999', published_at: '2026-05-08T00:00:00Z', html_url: 'https://example.test/' },
        'Fleetbase',
    );
    assert.ok(row.includes('CVE-2026-99999'));
});
