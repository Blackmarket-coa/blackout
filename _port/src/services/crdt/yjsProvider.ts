/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { IndexeddbPersistence } from "y-indexeddb";

import type { Doc as YDoc } from "yjs";
import { type CrdtDocType } from "./types";

export interface CrdtPersistence {
    whenSynced: Promise<void>;
}

export function getPersistenceKey(roomId: string, docType: CrdtDocType, docId?: string): string {
    const base = `${roomId}:${docType}`;
    return docId ? `${base}:${docId}` : base;
}

export function createIndexedDbPersistence(
    roomId: string,
    docType: CrdtDocType,
    yDoc: YDoc,
    docId?: string,
): CrdtPersistence {
    if (typeof globalThis.indexedDB === "undefined") {
        return {
            whenSynced: Promise.resolve(),
        };
    }

    const persistence = new IndexeddbPersistence(getPersistenceKey(roomId, docType, docId), yDoc);
    return {
        whenSynced: persistence.whenSynced.then(() => undefined),
    };
}
