/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface RTCEnvelope {
    payload: string;
    roomId: string;
    senderDeviceId: string;
    type: string;
}

export interface RTCPeerHandle {
    readonly peerId: string;
    isConnected(): boolean;
    send(envelope: RTCEnvelope): void;
}

/**
 * RTCTransport keeps track of active peer data channels.
 *
 * Connection setup remains Matrix-signaled in future iterations. For this
 * initial scaffold, we just keep an in-memory registry and a multicast helper.
 */
export class RTCTransport {
    private readonly peers = new Map<string, RTCPeerHandle>();

    public registerPeer(peer: RTCPeerHandle): void {
        this.peers.set(peer.peerId, peer);
    }

    public unregisterPeer(peerId: string): void {
        this.peers.delete(peerId);
    }

    public connectedPeerIds(): string[] {
        return [...this.peers.values()].filter((peer) => peer.isConnected()).map((peer) => peer.peerId);
    }

    public broadcast(envelope: RTCEnvelope): string[] {
        const deliveredTo: string[] = [];

        for (const peer of this.peers.values()) {
            if (!peer.isConnected()) continue;
            peer.send(envelope);
            deliveredTo.push(peer.peerId);
        }

        return deliveredTo;
    }
}
