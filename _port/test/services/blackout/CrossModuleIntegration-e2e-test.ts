/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type { CurriculumDocument, StudyCircleDocument } from "../../../src/modules/education/models/types";
import type { TaskBoardDocument } from "../../../src/modules/mutualAid/models/TaskBoard";
import {
    loadCurriculum,
    loadStudyCircle,
    saveCurriculum,
    saveStudyCircle,
} from "../../../src/services/crdt/educationBinding";
import { loadTaskBoard, saveTaskBoard } from "../../../src/services/crdt/mutualAidBinding";
import { IpfsService } from "../../../src/services/storage/ipfsService";
import { fromRoomContent, toRoomEventContent, toRoomStateContent } from "../../../src/services/storage/ipfsRoomEvents";

describe("Blackout cross-module e2e", () => {
    it("persists education and mutual-aid docs and links them through IPFS room content", async () => {
        const roomId = "!cross-module:example.org";
        const now = 1730000000000;

        const studyCircle: StudyCircleDocument = {
            id: "sc-1",
            roomId,
            title: "Neighborhood response 101",
            tags: ["mutual-aid", "onboarding"],
            facilitators: ["@alice:example.org"],
            createdAt: now,
            updatedAt: now,
        };

        const curriculum: CurriculumDocument = {
            studyCircleId: studyCircle.id,
            sections: [{ id: "s1", title: "Escalation safety", markdown: "Coordinate with board triage." }],
            updatedAt: now,
        };

        const board: TaskBoardDocument = {
            roomId,
            updatedAt: now,
            needs: [
                { id: "n1", title: "Meal drop", column: "backlog", updatedAt: now, requestedByUserId: "@bob:example.org" },
            ],
            offers: [
                {
                    id: "o1",
                    title: "First-aid training",
                    column: "in_progress",
                    updatedAt: now,
                    assignedToUserId: "@alice:example.org",
                },
            ],
        };

        await saveStudyCircle(studyCircle);
        await saveCurriculum(curriculum, roomId);
        await saveTaskBoard(board);

        await expect(loadStudyCircle(roomId, studyCircle.id)).resolves.toEqual(studyCircle);
        await expect(loadCurriculum(roomId, studyCircle.id)).resolves.toEqual(curriculum);
        await expect(loadTaskBoard(roomId)).resolves.toEqual(board);

        const ipfs = new IpfsService({ enabled: true });
        const circleRef = ipfs.toRoomCidReference(roomId, "bafy-circle", "study-circle.json", "@alice:example.org");
        const boardRef = ipfs.toRoomCidReference(roomId, "bafy-board", "task-board.json", "@alice:example.org");

        const event = toRoomEventContent(circleRef);
        const state = toRoomStateContent([circleRef, boardRef]);

        expect(fromRoomContent(event, roomId)).toEqual(circleRef);
        expect(state.assets).toHaveLength(2);
        expect(state.assets.map((asset) => asset.cid)).toEqual(["bafy-circle", "bafy-board"]);
    });
});
