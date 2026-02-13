/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export type CrdtDocType = "proposal" | "vote" | "delegation" | "study-circle" | "curriculum" | "task-board";

export interface CrdtDocMetadata {
    roomId: string;
    docType: CrdtDocType;
    docId: string;
    schemaVersion: number;
    updatedAt: number;
}

export interface CrdtSnapshot<TDocument> {
    metadata: CrdtDocMetadata;
    document: TDocument;
}
