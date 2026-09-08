import { DOCUMENT_TEMPLATES, type DocumentTemplate, type DocumentTemplateId } from './templates';
import type { DenDocumentModel } from './useDenDocuments';
import type { DenDocumentPayload } from '@blackout/protocol';

/**
 * Adding a document to a den that was not seeded with one.
 *
 * The Documents tab listed only what the playbook reveal seeded at den
 * creation, and there was no way to add anything. That gap has a specific
 * victim: `SEEDS` gives bylaws to Workshop, Commons, Local, Confluence and
 * Order, but NOT to Circle or Grove — so a circle that later decides to
 * incorporate had no route to bylaws inside the tool built for exactly that.
 * The reveal copy meanwhile told users they "can author documents from
 * scratch in the Documents tab", which was not true until now.
 */

/**
 * Seed templates this den does not already have.
 *
 * Compared on `derivedFromTemplateId` rather than on title, so a den that
 * renamed its "Mission" to "Why we exist" is still not offered a second one.
 */
export function availableTemplates(
    docs: ReadonlyArray<Pick<DenDocumentModel, 'derivedFromTemplateId'>>
): DocumentTemplate[] {
    const taken = new Set(
        docs.map((d) => d.derivedFromTemplateId).filter((id): id is string => !!id)
    );
    return (Object.keys(DOCUMENT_TEMPLATES) as DocumentTemplateId[])
        .filter((id) => !taken.has(id))
        .map((id) => DOCUMENT_TEMPLATES[id]);
}

/**
 * A document id that will not collide with an existing one.
 *
 * A seeded document uses its template id as the state key, so a hand-authored
 * document must not be able to claim one — upserting onto a template id would
 * silently overwrite the seeded document of the same name. Hence the prefix,
 * plus a numeric suffix walked until it is free.
 */
export function nextBlankDocId(docs: ReadonlyArray<Pick<DenDocumentModel, 'docId'>>): string {
    const taken = new Set(docs.map((d) => d.docId));
    let n = 1;
    while (taken.has(`custom-${n}`)) n += 1;
    return `custom-${n}`;
}

/**
 * Build the payload for a new document, from a template or blank.
 *
 * `editedAt` is passed in rather than read from the clock here so the function
 * stays pure and testable — the same reason the export helpers split.
 */
export function buildNewDocument(input: {
    template: DocumentTemplate | null;
    docId: string;
    authorId: string;
    now: string;
}): DenDocumentPayload {
    const { template, docId, authorId, now } = input;
    return {
        docId: template ? template.id : docId,
        title: template ? template.title : 'Untitled document',
        body: template ? template.body : '# Untitled document\n\n',
        version: 1,
        // Only a template-derived document carries provenance. A blank one has
        // no upstream source, and claiming one would be a fabricated credit.
        ...(template ? { derivedFromTemplateId: template.id } : {}),
        lastEditorId: authorId,
        editedAt: now,
    };
}
