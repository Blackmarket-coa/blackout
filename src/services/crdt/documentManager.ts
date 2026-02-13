/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { Doc as YDoc, encodeStateAsUpdate } from "yjs";

import { createIndexedDbPersistence } from "./yjsProvider";
import { type CrdtDocType } from "./types";

interface ManagedDoc {
    yDoc: YDoc;
    persistenceReady: Promise<void>;
}

const managedDocs = new Map<string, ManagedDoc>();

function getKey(roomId: string, docType: CrdtDocType, docId?: string): string {
    return docId ? `${roomId}:${docType}:${docId}` : `${roomId}:${docType}`;
}

export async function open(roomId: string, docType: CrdtDocType, docId?: string): Promise<YDoc> {
    const key = getKey(roomId, docType, docId);
    const existing = managedDocs.get(key);
    if (existing) {
        await existing.persistenceReady;
        return existing.yDoc;
    }

    const yDoc = new YDoc();
    const persistence = createIndexedDbPersistence(roomId, docType, yDoc, docId);
    const persistenceReady = persistence.whenSynced.then(() => undefined);

    managedDocs.set(key, { yDoc, persistenceReady });
    await persistenceReady;
    return yDoc;
}

export function close(roomId: string, docType: CrdtDocType, docId?: string): void {
    const key = getKey(roomId, docType, docId);
    const doc = managedDocs.get(key);
    if (!doc) return;

    doc.yDoc.destroy();
    managedDocs.delete(key);
}

export function snapshot(roomId: string, docType: CrdtDocType, docId?: string): Uint8Array | undefined {
    const key = getKey(roomId, docType, docId);
    const doc = managedDocs.get(key);
    if (!doc) return undefined;

    return encodeStateAsUpdate(doc.yDoc);
}
