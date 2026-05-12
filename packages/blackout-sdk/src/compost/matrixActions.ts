import {
    COMPOST_EVENT_TYPE,
    COMPOST_SCHEMA_VERSION,
    type CompostPayload,
} from '@blackout/protocol';
import type { MatrixEventClient } from '../matrix/types';

/**
 * Compost writer. Single state-event slot per den (empty state key), so a
 * den is either composted or not. The associated `leave` call is the
 * caller's responsibility — compost only writes the lineage marker.
 */
export const createCompostMatrixActions = (client: MatrixEventClient) => ({
    compost: async (roomId: string, payload: CompostPayload) =>
        client.sendStateEvent(
            roomId,
            COMPOST_EVENT_TYPE as never,
            { ...payload, schemaVersion: COMPOST_SCHEMA_VERSION } as never,
            '',
        ),
});
