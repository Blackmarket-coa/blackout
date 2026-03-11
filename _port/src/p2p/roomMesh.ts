/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface ChunkInventory {
    chunkHashes: string[];
    roomId: string;
}

/**
 * RoomMesh tracks the high-level lifecycle for the P2P data plane in a room.
 *
 * This is intentionally transport-agnostic and currently provides only a
 * minimal API surface so we can phase-in the new architecture behind a labs
 * flag without impacting existing Matrix message delivery.
 */
export class RoomMesh {
    private readonly inventories = new Map<string, Set<string>>();

    public constructor(public readonly roomId: string) {}

    public upsertPeerInventory(peerId: string, inventory: ChunkInventory): void {
        if (inventory.roomId !== this.roomId) return;
        this.inventories.set(peerId, new Set(inventory.chunkHashes));
    }

    public getMissingChunks(localChunkHashes: Iterable<string>): Set<string> {
        const local = new Set(localChunkHashes);
        const requested = new Set<string>();

        for (const inventory of this.inventories.values()) {
            for (const chunkHash of inventory) {
                if (!local.has(chunkHash)) {
                    requested.add(chunkHash);
                }
            }
        }

        return requested;
    }

    public removePeer(peerId: string): void {
        this.inventories.delete(peerId);
    }
}
