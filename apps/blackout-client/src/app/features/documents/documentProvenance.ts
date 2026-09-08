import {
    DOCUMENT_TEMPLATES,
    type DocumentTemplate,
    type DocumentTemplateId,
    type DocumentTemplateLicense,
} from './templates';
import type { DenDocumentModel } from './useDenDocuments';

/**
 * Where a founding document came from, and under what licence.
 *
 * The `attribution` field has existed on every seed template since the
 * documents feature shipped and was never rendered anywhere — the only credit
 * a reader ever saw was the italic trailer inside the seed body, which the
 * first edit can delete. This resolves it for display.
 *
 * Looked up from `derivedFromTemplateId` rather than persisted onto the
 * document. The seed writer drops `attribution` when it creates the state
 * event, and that is the better arrangement: the id is provenance and does not
 * change, while the attribution sentence is editorial text we may need to
 * correct. Persisting it would freeze a copy in every den's room state, where
 * fixing it later means rewriting other people's rooms.
 */
export interface DocumentProvenance {
    templateId: DocumentTemplateId;
    attribution: string;
    license: DocumentTemplateLicense;
}

const isKnownTemplateId = (id: string): id is DocumentTemplateId =>
    Object.prototype.hasOwnProperty.call(DOCUMENT_TEMPLATES, id);

/**
 * Provenance for a document, or `null` for one authored from scratch.
 *
 * Also null for a `derivedFromTemplateId` we no longer recognise — a den
 * seeded by an older client, or a template since renamed. An unknown id is not
 * an error and must not throw: the document is still the den's, and losing the
 * credit line is a smaller harm than a crashing editor.
 */
export function documentProvenance(
    doc: Pick<DenDocumentModel, 'derivedFromTemplateId'>
): DocumentProvenance | null {
    const id = doc.derivedFromTemplateId;
    if (!id || !isKnownTemplateId(id)) return null;
    const template: DocumentTemplate = DOCUMENT_TEMPLATES[id];
    return {
        templateId: id,
        attribution: template.attribution,
        license: template.license,
    };
}

/**
 * The warning a non-commercial seed needs, or null.
 *
 * States the fact and names the decision; it does not resolve it. Whether a
 * trading co-op adopting a CC BY-NC seed as its own internal agreement counts
 * as commercial use is a real question, and `templates/index.ts` already
 * records that legal review of the seed texts is a parallel content task. The
 * honest move is to put the flag in front of the person who has to ask.
 */
export function noncommercialNotice(provenance: DocumentProvenance | null): string | null {
    if (!provenance?.license.noncommercial) return null;
    return (
        `This seed is ${provenance.license.code} — the upstream library ` +
        `publishes it for non-commercial use. A co-op that trades is a ` +
        `commercial entity, so check this with your legal review before ` +
        `adopting the text as-is.`
    );
}
