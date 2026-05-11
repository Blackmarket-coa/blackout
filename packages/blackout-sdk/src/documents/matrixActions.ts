import {
    DEN_DOCUMENT_EVENT_TYPE,
    DEN_DOCUMENT_SCHEMA_VERSION,
    type DenDocumentPayload,
} from '@blackout/protocol';
import type { MatrixEventClient } from '../matrix/types';

/**
 * Document writer. Documents are state events keyed by `docId` so a den
 * can carry many in parallel — bylaws + mission + decision-rules, plus
 * whatever the room writes later. Replacements form the version chain
 * via Matrix's native state-event history.
 */
export const createDocumentsMatrixActions = (client: MatrixEventClient) => ({
    upsertDocument: async (roomId: string, payload: DenDocumentPayload) =>
        client.sendStateEvent(
            roomId,
            DEN_DOCUMENT_EVENT_TYPE as never,
            { ...payload, schemaVersion: DEN_DOCUMENT_SCHEMA_VERSION } as never,
            payload.docId,
        ),
});
