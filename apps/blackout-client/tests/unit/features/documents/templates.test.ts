import { describe, expect, it } from 'vitest';
import {
    DOCUMENT_TEMPLATES,
    seedDocumentsForPlaybook,
} from '../../../../src/app/features/documents/templates';
import {
    PLAYBOOK_IDS,
    isDenDocumentPayload,
} from '@blackout/protocol';

describe('DOCUMENT_TEMPLATES', () => {
    it('every template has stable id, title, body and attribution', () => {
        for (const [id, tpl] of Object.entries(DOCUMENT_TEMPLATES)) {
            expect(tpl.id).toBe(id);
            expect(tpl.title.length).toBeGreaterThan(0);
            expect(tpl.body.length).toBeGreaterThan(0);
            expect(tpl.attribution.length).toBeGreaterThan(0);
        }
    });
});

describe('seedDocumentsForPlaybook', () => {
    it('returns nothing for the casual playbook (Hearth)', () => {
        expect(seedDocumentsForPlaybook('hearth')).toEqual([]);
    });

    it('seeds a mutual-aid agreement specifically for Grove', () => {
        const ids = seedDocumentsForPlaybook('grove').map((t) => t.id);
        expect(ids).toContain('mutual-aid-agreement-cfl');
        expect(ids).toContain('mission-usfwc');
        expect(ids).toContain('decision-rules-usfwc');
    });

    it('every playbook id resolves to a defined seed list (no surprises)', () => {
        for (const id of PLAYBOOK_IDS) {
            const seeds = seedDocumentsForPlaybook(id);
            expect(Array.isArray(seeds)).toBe(true);
            for (const seed of seeds) {
                expect(DOCUMENT_TEMPLATES[seed.id as keyof typeof DOCUMENT_TEMPLATES]).toBeDefined();
            }
        }
    });

    it('seeded documents pass the protocol guard once stamped', () => {
        const seeds = seedDocumentsForPlaybook('workshop');
        for (const seed of seeds) {
            const payload = {
                docId: seed.id,
                title: seed.title,
                body: seed.body,
                version: 1,
                derivedFromTemplateId: seed.id,
                lastEditorId: '@alice:x',
                editedAt: '2026-05-11T00:00:00Z',
            };
            expect(isDenDocumentPayload(payload)).toBe(true);
        }
    });
});
