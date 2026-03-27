/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export type TaskBoardColumn = "backlog" | "in_progress" | "done";

export interface TaskBoardItem {
    id: string;
    title: string;
    description?: string;
    requestedByUserId?: string;
    assignedToUserId?: string;
    column: TaskBoardColumn;
    updatedAt: number;
}

export interface TaskBoardDocument {
    roomId: string;
    needs: TaskBoardItem[];
    offers: TaskBoardItem[];
    updatedAt: number;
}
