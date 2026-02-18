/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { RoomMesh } from "./roomMesh";
import { type RTCPeerHandle, RTCTransport } from "./rtcTransport";

export interface PeerSnapshot {
    connectedPeerIds: string[];
    roomId: string;
}

/**
 * PeerManager coordinates room-level peer state and transport fanout.
 */
export class PeerManager {
    private readonly transport = new RTCTransport();
    private readonly mesh: RoomMesh;

    public constructor(public readonly roomId: string) {
        this.mesh = new RoomMesh(roomId);
    }

    public addPeer(peer: RTCPeerHandle): void {
        this.transport.registerPeer(peer);
    }

    public removePeer(peerId: string): void {
        this.transport.unregisterPeer(peerId);
        this.mesh.removePeer(peerId);
    }

    public snapshot(): PeerSnapshot {
        return {
            roomId: this.roomId,
            connectedPeerIds: this.transport.connectedPeerIds(),
        };
    }
}
