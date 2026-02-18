/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface WebRTCPeerState {
    channel?: RTCDataChannel;
    connection: RTCPeerConnection;
    peerId: string;
}

/**
 * Phase 2 entry point: manages persistent RTCDataChannel instances per peer.
 * Signaling remains Matrix-based and external to this class.
 */
export class WebRTCRoomMesh {
    private readonly peers = new Map<string, WebRTCPeerState>();

    public constructor(private readonly rtcConfiguration: RTCConfiguration) {}

    public createPeer(peerId: string): WebRTCPeerState {
        const connection = new RTCPeerConnection(this.rtcConfiguration);
        const channel = connection.createDataChannel(`blackout:${peerId}`, { ordered: true });

        const state: WebRTCPeerState = {
            peerId,
            connection,
            channel,
        };

        this.peers.set(peerId, state);
        return state;
    }

    public registerRemotePeer(peerId: string, connection: RTCPeerConnection): WebRTCPeerState {
        const state: WebRTCPeerState = {
            peerId,
            connection,
        };

        connection.ondatachannel = (event) => {
            state.channel = event.channel;
        };

        this.peers.set(peerId, state);
        return state;
    }

    public connectedPeerIds(): string[] {
        return [...this.peers.values()]
            .filter((peer) => peer.connection.connectionState === "connected" && peer.channel?.readyState === "open")
            .map((peer) => peer.peerId);
    }

    public send(peerId: string, payload: string): boolean {
        const peer = this.peers.get(peerId);
        if (!peer?.channel || peer.channel.readyState !== "open") return false;
        peer.channel.send(payload);
        return true;
    }

    public broadcast(payload: string): string[] {
        const deliveredTo: string[] = [];

        for (const peer of this.peers.values()) {
            if (!peer.channel || peer.channel.readyState !== "open") continue;
            peer.channel.send(payload);
            deliveredTo.push(peer.peerId);
        }

        return deliveredTo;
    }

    public closePeer(peerId: string): void {
        const peer = this.peers.get(peerId);
        if (!peer) return;
        peer.channel?.close();
        peer.connection.close();
        this.peers.delete(peerId);
    }

    public closeAll(): void {
        for (const peerId of this.peers.keys()) {
            this.closePeer(peerId);
        }
    }
}
