/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type { IpfsCidReference } from "./ipfsService";

export const IPFS_ROOM_EVENT_TYPE = "im.blackout.ipfs.asset";
export const IPFS_ROOM_STATE_TYPE = "im.blackout.ipfs.assets";

interface IpfsRoomEventContent {
    msgtype: typeof IPFS_ROOM_EVENT_TYPE;
    body: string;
    ipfs: {
        cid: string;
        room_id: string;
        name?: string;
        uploaded_by?: string;
        uploaded_at: number;
    };
}

interface IpfsRoomStateContent {
    schema_version: 1;
    updated_at: number;
    assets: IpfsRoomEventContent["ipfs"][];
}

function toAsset(reference: IpfsCidReference): IpfsRoomEventContent["ipfs"] {
    return {
        cid: reference.cid,
        room_id: reference.roomId,
        name: reference.name,
        uploaded_by: reference.uploadedByUserId,
        uploaded_at: reference.uploadedAt,
    };
}

export function toRoomEventContent(reference: IpfsCidReference): IpfsRoomEventContent {
    return {
        msgtype: IPFS_ROOM_EVENT_TYPE,
        body: reference.name ?? `IPFS asset ${reference.cid}`,
        ipfs: toAsset(reference),
    };
}

export function toRoomStateContent(references: IpfsCidReference[]): IpfsRoomStateContent {
    return {
        schema_version: 1,
        updated_at: Date.now(),
        assets: references.map(toAsset),
    };
}

export function fromRoomContent(content: unknown, expectedRoomId?: string): IpfsCidReference | undefined {
    if (!content || typeof content !== "object") {
        return undefined;
    }

    const ipfs = (content as { ipfs?: Record<string, unknown> }).ipfs;
    if (!ipfs || typeof ipfs !== "object") {
        return undefined;
    }

    const cid = ipfs.cid;
    const roomId = ipfs.room_id;
    const uploadedAt = ipfs.uploaded_at;
    if (
        typeof cid !== "string" ||
        typeof roomId !== "string" ||
        typeof uploadedAt !== "number" ||
        !Number.isFinite(uploadedAt)
    ) {
        return undefined;
    }

    if (expectedRoomId && roomId !== expectedRoomId) {
        return undefined;
    }

    return {
        cid,
        roomId,
        uploadedAt,
        name: typeof ipfs.name === "string" ? ipfs.name : undefined,
        uploadedByUserId: typeof ipfs.uploaded_by === "string" ? ipfs.uploaded_by : undefined,
    };
}
