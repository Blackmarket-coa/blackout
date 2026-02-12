/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { IndexeddbPersistence } from "y-indexeddb";

import type { Doc as YDoc } from "yjs";
import { type CrdtDocType } from "./types";

export function getPersistenceKey(roomId: string, docType: CrdtDocType): string {
    return `${roomId}:${docType}`;
}

export function createIndexedDbPersistence(roomId: string, docType: CrdtDocType, yDoc: YDoc): IndexeddbPersistence {
    return new IndexeddbPersistence(getPersistenceKey(roomId, docType), yDoc);
}
