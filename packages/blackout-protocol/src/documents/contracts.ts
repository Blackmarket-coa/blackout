/**
 * Den-document contract.
 *
 * Founding documents — bylaws, mission, decision rules — ride on Matrix
 * state events keyed by `docId`. Successive edits replace the state event;
 * Matrix retains the chain natively, so version history is the room's
 * state-event history rather than a bespoke ledger.
 *
 * Seed templates pull from SELC's Legal Resource Library, USFWC's
 * worker-co-op bylaws templates, and CFL's parent-coop docs (all
 * permissively published for reuse, with attribution carried in
 * `derivedFromTemplateId`). Legal review is a parallel content task —
 * the protocol surface here is the v1 minimum.
 */

import type { EventEnvelope } from '../common/types';

export const DEN_DOCUMENT_PROTOCOL_VERSION = 1 as const;

export interface DenDocumentPayload {
    /** Stable id; matches the state event's state key. */
    docId: string;
    /** Short title — "Bylaws", "Mission", etc. */
    title: string;
    /** Markdown body. Renderers should sanitize before display. */
    body: string;
    /**
     * Monotonic version stamp. Clients bump on each upsert; the underlying
     * state-event chain remains the authority on history, but `version`
     * helps surface "edited" indicators without inspecting history.
     */
    version: number;
    /** Optional template id this document was seeded from (provenance). */
    derivedFromTemplateId?: string;
    /** Matrix user id of the last editor. */
    lastEditorId: string;
    /** ISO-8601 timestamp of the last edit. */
    editedAt: string;
}

export const isDenDocumentPayload = (value: unknown): value is DenDocumentPayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.docId !== 'string') return false;
    if (typeof p.title !== 'string') return false;
    if (typeof p.body !== 'string') return false;
    if (typeof p.version !== 'number') return false;
    if (typeof p.lastEditorId !== 'string') return false;
    if (typeof p.editedAt !== 'string') return false;
    if (p.derivedFromTemplateId !== undefined && typeof p.derivedFromTemplateId !== 'string') {
        return false;
    }
    return true;
};

export type DenDocumentUpsertedEvent = EventEnvelope<
    'blackout.den.document.upserted',
    DenDocumentPayload
>;

export interface DenDocumentProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof DEN_DOCUMENT_PROTOCOL_VERSION;
    policy: 'additive-only-minor';
}

export const DEN_DOCUMENT_PROTOCOL_SURFACE: DenDocumentProtocolSurface = {
    owner: '@blackout/protocol',
    version: DEN_DOCUMENT_PROTOCOL_VERSION,
    policy: 'additive-only-minor',
};
