/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { BLACKOUT_SIGNAL_EVENT_TYPE } from "./signalEvent";
import { WebRTCRoomMesh } from "./webrtcMesh";

interface SignalEnvelope {
    candidate?: RTCIceCandidateInit;
    room_id: string;
    routing_metadata: {
        signal_type: "rtc_offer" | "rtc_answer" | "ice_candidate";
    };
    sdp?: RTCSessionDescriptionInit;
}

interface SignalingRoomState {
    mesh: WebRTCRoomMesh;
}

const DEFAULT_RTC_CONFIG: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class RTCSignalingManager {
    private static _instance?: RTCSignalingManager;
    private readonly rooms = new Map<string, SignalingRoomState>();

    public static get instance(): RTCSignalingManager {
        this._instance ??= new RTCSignalingManager();
        return this._instance;
    }

    public registerClient(client: MatrixClient): void {
        if (typeof (client as any).on !== "function") return;

        (client as any).on("Room.timeline", (event: any) => {
            if (event?.getType?.() !== BLACKOUT_SIGNAL_EVENT_TYPE) return;
            const content = event.getContent?.() as Partial<SignalEnvelope>;
            if (!content?.routing_metadata?.signal_type || !content.room_id) return;

            const senderId = event.getSender?.();
            if (!senderId || senderId === (client as any).getUserId?.()) return;
            void this.onSignal(client, content as SignalEnvelope, senderId);
        });

        if (typeof window !== "undefined") {
            window.addEventListener("online", () => this.reconnectAll(client));
        }
    }

    private getOrCreateRoom(roomId: string): SignalingRoomState {
        const existing = this.rooms.get(roomId);
        if (existing) return existing;

        const created: SignalingRoomState = {
            mesh: new WebRTCRoomMesh(DEFAULT_RTC_CONFIG),
        };
        this.rooms.set(roomId, created);
        return created;
    }

    public async ensurePeer(client: MatrixClient, roomId: string, peerId: string): Promise<void> {
        const roomState = this.getOrCreateRoom(roomId);
        if (roomState.mesh.hasPeer(peerId)) return;

        const peer = roomState.mesh.getOrCreatePeer(peerId);
        peer.connection.onicecandidate = (event) => {
            if (!event.candidate) return;
            void this.sendSignal(client, roomId, {
                room_id: roomId,
                routing_metadata: { signal_type: "ice_candidate" },
                candidate: event.candidate.toJSON(),
            });
        };

        const offer = await peer.connection.createOffer();
        await peer.connection.setLocalDescription(offer);
        await this.sendSignal(client, roomId, {
            room_id: roomId,
            routing_metadata: { signal_type: "rtc_offer" },
            sdp: offer,
        });
    }

    public async syncRoomPeers(client: MatrixClient, roomId: string): Promise<void> {
        const room = client.getRoom(roomId);
        if (!room) return;
        for (const member of room.getJoinedMembers()) {
            if (member.userId === client.getUserId()) continue;
            await this.ensurePeer(client, roomId, member.userId);
        }
    }

    private async onSignal(client: MatrixClient, signal: SignalEnvelope, senderId: string): Promise<void> {
        const roomState = this.getOrCreateRoom(signal.room_id);
        const existing = roomState.mesh.getPeer(senderId);
        const peer = existing ?? roomState.mesh.registerRemotePeer(senderId, new RTCPeerConnection(DEFAULT_RTC_CONFIG));

        peer.connection.onicecandidate = (event) => {
            if (!event.candidate) return;
            void this.sendSignal(client, signal.room_id, {
                room_id: signal.room_id,
                routing_metadata: { signal_type: "ice_candidate" },
                candidate: event.candidate.toJSON(),
            });
        };

        if (signal.routing_metadata.signal_type === "rtc_offer" && signal.sdp) {
            await peer.connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await peer.connection.createAnswer();
            await peer.connection.setLocalDescription(answer);
            await this.sendSignal(client, signal.room_id, {
                room_id: signal.room_id,
                routing_metadata: { signal_type: "rtc_answer" },
                sdp: answer,
            });
            return;
        }

        if (signal.routing_metadata.signal_type === "rtc_answer" && signal.sdp) {
            await peer.connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            return;
        }

        if (signal.routing_metadata.signal_type === "ice_candidate" && signal.candidate) {
            await peer.connection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }

    private async sendSignal(client: MatrixClient, roomId: string, signal: SignalEnvelope): Promise<void> {
        try {
            await client.sendEvent(roomId, BLACKOUT_SIGNAL_EVENT_TYPE as never, signal as never);
        } catch (error) {
            logger.warn("Failed to send RTC signaling envelope", error);
        }
    }

    public sendPayload(roomId: string, payload: string): string[] {
        return this.getOrCreateRoom(roomId).mesh.broadcast(payload);
    }

    private reconnectAll(client: MatrixClient): void {
        for (const roomId of this.rooms.keys()) {
            void this.syncRoomPeers(client, roomId);
        }
    }
}
