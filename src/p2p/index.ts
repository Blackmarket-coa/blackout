/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export { PeerManager, type PeerSnapshot } from "./peerManager";
export { RoomMesh, type ChunkInventory } from "./roomMesh";
export { RTCTransport, type RTCEnvelope, type RTCPeerHandle } from "./rtcTransport";
export {
    BLACKOUT_SIGNAL_EVENT_TYPE,
    createBlackoutSignalEventContent,
    getBlackoutSignalTelemetrySnapshot,
    isAttachmentMessageType,
    isBlackoutSignalEventContent,
    isMetadataOnlyMatrixModeEnabled,
    maybeSendBlackoutSignalEventForAttachment,
    maybeSendBlackoutSignalEventForMessage,
    sendBlackoutSignalEvent,
    sha256,
    type BlackoutSignalEventContent,
} from "./signalEvent";
export {
    canEnableMetadataOnlyMatrixMode,
    CUTOVER_KILL_SWITCH_STORAGE_KEY,
    CUTOVER_PARITY_STORAGE_KEY,
    CUTOVER_RECOVERY_STORAGE_KEY,
    getCutoverReadiness,
    type CutoverReadiness,
} from "./cutoverGate";
export { EncryptedPayloadStore, getEncryptedPayloadStore, type StoredEncryptedPayload } from "./payloadStore";
export { WebRTCRoomMesh, type WebRTCPeerState } from "./webrtcMesh";
