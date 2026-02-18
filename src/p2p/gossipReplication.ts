/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { RoomMesh } from "./roomMesh";

export interface GossipRequest {
    missingHashes: string[];
    peerId: string;
}

/**
 * Gossip replication protocol helper for inventory exchange and redundancy checks.
 */
export class GossipReplicator {
    private readonly mesh: RoomMesh;

    public constructor(private readonly roomId: string, private readonly redundancyTarget = 3) {
        this.mesh = new RoomMesh(roomId);
    }

    public onPeerInventory(peerId: string, chunkHashes: string[]): void {
        this.mesh.upsertPeerInventory(peerId, {
            roomId: this.roomId,
            chunkHashes,
        });
    }

    public buildMissingRequest(peerId: string, localChunks: string[]): GossipRequest {
        return {
            peerId,
            missingHashes: [...this.mesh.getMissingChunks(localChunks)],
        };
    }

    public hashesNeedingReplication(replicaCounts: Map<string, number>): string[] {
        const underReplicated: string[] = [];
        for (const [hash, count] of replicaCounts) {
            if (count < this.redundancyTarget) {
                underReplicated.push(hash);
            }
        }
        return underReplicated;
    }

    public removePeer(peerId: string): void {
        this.mesh.removePeer(peerId);
    }
}
