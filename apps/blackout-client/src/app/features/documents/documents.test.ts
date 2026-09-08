import { describe, expect, it } from 'vitest';
import { documentProvenance, noncommercialNotice } from './documentProvenance';
import { exportFilename, exportMarkdown } from './documentExport';
import { availableTemplates, buildNewDocument, nextBlankDocId } from './newDocument';
import { DOCUMENT_TEMPLATES, seedDocumentsForPlaybook } from './templates';
import type { DenDocumentModel } from './useDenDocuments';

const doc = (over: Partial<DenDocumentModel> = {}): DenDocumentModel => ({
    docId: 'bylaws-selc',
    title: 'Bylaws',
    body: '# Bylaws\n\nSome text.',
    version: 3,
    derivedFromTemplateId: 'bylaws-selc',
    lastEditorId: '@me:example.org',
    editedAt: '2026-09-08T00:00:00.000Z',
    eventId: '$evt',
    ...over,
});

describe('documentProvenance', () => {
    it('resolves attribution from the template id, which is what is persisted', () => {
        // The seed writer drops `attribution` when it creates the state event;
        // only `derivedFromTemplateId` survives. This is the lookup that makes
        // the credit renderable without a protocol change.
        const p = documentProvenance(doc());
        expect(p?.attribution).toBe(DOCUMENT_TEMPLATES['bylaws-selc'].attribution);
        expect(p?.license.code).toBe('CC BY-SA');
    });

    it('is null for a document authored from scratch', () => {
        expect(documentProvenance(doc({ derivedFromTemplateId: undefined }))).toBeNull();
    });

    it('is null — not a throw — for a template id it no longer recognises', () => {
        // A den seeded by an older client, or a template since renamed. Losing
        // the credit line is a smaller harm than a crashing editor.
        expect(documentProvenance(doc({ derivedFromTemplateId: 'gone-forever' }))).toBeNull();
    });

    it('does not treat inherited Object properties as template ids', () => {
        expect(documentProvenance(doc({ derivedFromTemplateId: 'constructor' }))).toBeNull();
        expect(documentProvenance(doc({ derivedFromTemplateId: '__proto__' }))).toBeNull();
    });
});

describe('noncommercialNotice', () => {
    it('warns on the CC BY-NC seed, naming the licence', () => {
        const notice = noncommercialNotice(
            documentProvenance(doc({ derivedFromTemplateId: 'mutual-aid-agreement-cfl' }))
        );
        expect(notice).toContain('CC BY-NC');
        expect(notice).toMatch(/commercial/i);
    });

    it('says nothing for a share-alike seed or an unseeded document', () => {
        expect(noncommercialNotice(documentProvenance(doc()))).toBeNull();
        expect(noncommercialNotice(null)).toBeNull();
    });

    it('flags exactly one of the four seeds, so the warning stays meaningful', () => {
        const flagged = Object.values(DOCUMENT_TEMPLATES).filter((t) => t.license.noncommercial);
        expect(flagged.map((t) => t.id)).toEqual(['mutual-aid-agreement-cfl']);
    });
});

describe('exportFilename', () => {
    it('uses the document title', () => {
        expect(exportFilename({ title: 'Bylaws', docId: 'x' })).toBe('Bylaws.md');
    });

    it('strips characters a filesystem will not take', () => {
        expect(exportFilename({ title: 'Rules: v2/final?', docId: 'x' })).toBe('Rules v2 final.md');
    });

    it('falls back to the doc id rather than producing ".md"', () => {
        // Some browsers silently refuse to save a file with an empty stem.
        expect(exportFilename({ title: '///', docId: 'custom-1' })).toBe('custom-1.md');
        expect(exportFilename({ title: '   ', docId: 'custom-2' })).toBe('custom-2.md');
    });

    it('does not leave a trailing dot or space, which Windows rejects', () => {
        expect(exportFilename({ title: 'Mission.', docId: 'x' })).toBe('Mission.md');
    });
});

describe('exportMarkdown', () => {
    it('appends a provenance footer for a seeded document', () => {
        const out = exportMarkdown(doc());
        expect(out).toContain('# Bylaws');
        expect(out).toContain(DOCUMENT_TEMPLATES['bylaws-selc'].attribution);
        expect(out).toContain('Licence: CC BY-SA.');
        expect(out).toContain('version 3');
    });

    it('exports exactly what was written for an unseeded document', () => {
        const out = exportMarkdown(
            doc({ derivedFromTemplateId: undefined, body: '# Ours\n\nWe wrote this.' })
        );
        expect(out).toBe('# Ours\n\nWe wrote this.\n');
        expect(out).not.toContain('Adapted from');
    });

    it('ends with exactly one newline, not a run of blank lines', () => {
        const out = exportMarkdown(doc({ body: '# Bylaws\n\n\n\n' }));
        expect(out.endsWith('\n')).toBe(true);
        expect(out).not.toMatch(/\n{3,}$/);
    });
});

describe('availableTemplates', () => {
    it('offers bylaws to a Circle, which is never seeded with them', () => {
        // The gap this closes: SEEDS gives bylaws to Workshop, Commons, Local,
        // Confluence and Order — but not to Circle or Grove.
        const circleSeeds = seedDocumentsForPlaybook('circle');
        expect(circleSeeds.map((t) => t.id)).not.toContain('bylaws-selc');

        const existing = circleSeeds.map((t) => ({ derivedFromTemplateId: t.id }));
        expect(availableTemplates(existing).map((t) => t.id)).toContain('bylaws-selc');
    });

    it('offers the same to a Grove', () => {
        const groveSeeds = seedDocumentsForPlaybook('grove');
        const existing = groveSeeds.map((t) => ({ derivedFromTemplateId: t.id }));
        expect(availableTemplates(existing).map((t) => t.id)).toContain('bylaws-selc');
    });

    it('does not offer a template the den already has', () => {
        const existing = Object.keys(DOCUMENT_TEMPLATES).map((id) => ({
            derivedFromTemplateId: id,
        }));
        expect(availableTemplates(existing)).toHaveLength(0);
    });

    it('matches on template id, so a renamed document still counts', () => {
        const existing = [{ derivedFromTemplateId: 'mission-usfwc' }];
        expect(availableTemplates(existing).map((t) => t.id)).not.toContain('mission-usfwc');
    });

    it('offers everything to a den with no documents at all', () => {
        expect(availableTemplates([])).toHaveLength(Object.keys(DOCUMENT_TEMPLATES).length);
    });
});

describe('nextBlankDocId', () => {
    it('never returns an id that would overwrite an existing document', () => {
        expect(nextBlankDocId([])).toBe('custom-1');
        expect(nextBlankDocId([{ docId: 'custom-1' }])).toBe('custom-2');
        expect(nextBlankDocId([{ docId: 'custom-1' }, { docId: 'custom-2' }])).toBe('custom-3');
    });

    it('cannot collide with a seeded template id, at any depth', () => {
        // A seeded document's state key IS its template id, so a hand-authored
        // doc claiming one would silently overwrite the seed. The prefix is
        // what guarantees this, so assert the invariant rather than one value.
        const templateIds = Object.keys(DOCUMENT_TEMPLATES);
        expect(templateIds.some((id) => id.startsWith('custom-'))).toBe(false);

        const existing: { docId: string }[] = [];
        for (let i = 0; i < 25; i += 1) {
            const next = nextBlankDocId(existing);
            expect(next).toMatch(/^custom-\d+$/);
            expect(templateIds).not.toContain(next);
            existing.push({ docId: next });
        }
        // And every id it handed out was distinct.
        expect(new Set(existing.map((d) => d.docId)).size).toBe(25);
    });
});

describe('buildNewDocument', () => {
    const now = '2026-09-08T12:00:00.000Z';

    it('carries provenance for a template-derived document', () => {
        const built = buildNewDocument({
            template: DOCUMENT_TEMPLATES['bylaws-selc'],
            docId: 'unused',
            authorId: '@me:example.org',
            now,
        });
        expect(built.docId).toBe('bylaws-selc');
        expect(built.derivedFromTemplateId).toBe('bylaws-selc');
        expect(built.title).toBe('Bylaws');
        expect(built.version).toBe(1);
    });

    it('claims no provenance for a blank document', () => {
        // Claiming a source it was not adapted from would be a fabricated
        // credit, and would make the export footer lie.
        const built = buildNewDocument({
            template: null,
            docId: 'custom-1',
            authorId: '@me:example.org',
            now,
        });
        expect(built.docId).toBe('custom-1');
        expect(built.derivedFromTemplateId).toBeUndefined();
        expect(exportMarkdown({ ...built, eventId: '$e' })).not.toContain('Adapted from');
    });
});
