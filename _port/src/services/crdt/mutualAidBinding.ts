/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { open } from "./documentManager";
import type { TaskBoardDocument } from "../../modules/mutualAid/models/TaskBoard";

export async function saveTaskBoard(board: TaskBoardDocument): Promise<void> {
    const yDoc = await open(board.roomId, "task-board", "board");
    yDoc.getMap("task-board").set("document", JSON.stringify(board));
}

export async function loadTaskBoard(roomId: string): Promise<TaskBoardDocument | undefined> {
    const yDoc = await open(roomId, "task-board", "board");
    const raw = yDoc.getMap("task-board").get("document");
    return typeof raw === "string" ? (JSON.parse(raw) as TaskBoardDocument) : undefined;
}
