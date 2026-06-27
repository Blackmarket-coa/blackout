// The subset of the Matrix bot client the bridge uses. Declared as an injectable
// dependency (defaulting to the real singleton) so unit tests can pass a fake and
// assert the room operations without a live Synapse — mirroring the
// `matrixClient` option on `deliverWebhookPayload` in discordCompatWebhooks.
import { matrixClient } from '../../integrations/matrix-client';

export type FbmBridgeMatrixClient = Pick<
    typeof matrixClient,
    | 'createRoom'
    | 'sendEvent'
    | 'sendStateEvent'
    | 'getRoomStateEvents'
    | 'inviteToRoom'
    | 'adminJoinUserToRoom'
    | 'kickFromRoom'
    | 'purgeRoom'
    | 'botUserId'
>;

export const defaultMatrixClient: FbmBridgeMatrixClient = matrixClient;
