import {
    ROLE_EVENT_TYPE,
    ROLES_SCHEMA_VERSION,
    type RolePayload,
} from '@blackout/protocol';
import type { MatrixEventClient } from '../matrix/types';

/**
 * Matrix-side writer for roles. Each role is a state event keyed by
 * `roleId` so a den can carry multiple roles in parallel. Term-end is a
 * visible *seasonal shift*, not a calendar alarm — clients derive the
 * phenology phase from the term bounds (see `phaseFromRoleTerm`).
 */
export const createRolesMatrixActions = (client: MatrixEventClient) => ({
    setRole: async (roomId: string, payload: RolePayload) =>
        client.sendStateEvent(
            roomId,
            ROLE_EVENT_TYPE as never,
            { ...payload, schemaVersion: ROLES_SCHEMA_VERSION } as never,
            payload.roleId,
        ),
});
