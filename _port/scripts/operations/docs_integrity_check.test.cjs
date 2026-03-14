const test = require('node:test');
const assert = require('node:assert/strict');

const {
    collectStatusValues,
    extractOpenMarkerCount,
    findEvidenceReferences,
    validateCanonicalStatuses,
    validateUnfinishedMarkerSynchronization,
} = require('./docs_integrity_check.cjs');

test('collectStatusValues reads status lines and status table columns', () => {
    const markdown = `Status: Complete\n\n| Item | Status |\n| --- | --- |\n| A | In progress |\n`;

    const values = collectStatusValues(markdown).map((v) => v.value);
    assert.deepEqual(values, ['Complete', 'In progress']);
});

test('validateCanonicalStatuses reports non-canonical values with file and line', () => {
    const markdown = 'Status: Done';
    const errors = validateCanonicalStatuses('docs/sample.md', markdown);

    assert.equal(errors.length, 1);
    assert.match(errors[0], /docs\/sample\.md:1 invalid status "Done"/);
    assert.match(errors[0], /Complete, In progress, Partial, Blocked/);
});

test('extractOpenMarkerCount supports supported count patterns', () => {
    assert.equal(extractOpenMarkerCount('a.md', 'Open items: **98**'), 98);
    assert.equal(extractOpenMarkerCount('b.md', 'open marker inventory: 77'), 77);
    assert.equal(extractOpenMarkerCount('c.md', 'backlog remains high (21)'), 21);
});

test('validateUnfinishedMarkerSynchronization reports mismatched counts', () => {
    const errors = validateUnfinishedMarkerSynchronization({
        'docs/a.md': 'Open items: **98**',
        'docs/b.md': 'open marker inventory: 97',
    });

    assert.equal(errors.length, 1);
    assert.match(errors[0], /not synchronized/);
    assert.match(errors[0], /docs\/a\.md=98/);
    assert.match(errors[0], /docs\/b\.md=97/);
});

test('findEvidenceReferences extracts evidence links with line numbers', () => {
    const markdown = [
        'first docs/operations/evidence/2026-03-14-centralized-ci-replay.md',
        'second docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md',
    ].join('\n');

    const refs = findEvidenceReferences('docs/sample.md', markdown);
    assert.equal(refs.length, 2);
    assert.deepEqual(refs[0], {
        ref: 'docs/operations/evidence/2026-03-14-centralized-ci-replay.md',
        line: 1,
    });
    assert.deepEqual(refs[1], {
        ref: 'docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md',
        line: 2,
    });
});
