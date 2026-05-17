import {
    DEN_PLAYBOOK_EVENT_TYPE,
    PLAYBOOK_SCHEMA_VERSION,
    type DenPlaybookPayload,
} from '@blackout/protocol';
import type { MatrixEventClient } from '../matrix/types';

/**
 * Matrix-side writer for `co.bmc.den.playbook`.
 *
 * The playbook is stored as a state event with a fixed empty state key — one
 * playbook per den. Mode transitions (`trial` → `committed`), domain edits,
 * accent swaps, and name changes all flow through `setPlaybook` with the
 * full updated payload.
 */
export const createPlaybookMatrixActions = (client: MatrixEventClient) => ({
    setPlaybook: async (roomId: string, content: DenPlaybookPayload) =>
        client.sendStateEvent(
            roomId,
            DEN_PLAYBOOK_EVENT_TYPE,
            { ...content, schemaVersion: PLAYBOOK_SCHEMA_VERSION },
            ''
        ),
});
