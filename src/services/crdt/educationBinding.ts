/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { open } from "./documentManager";
import type { CurriculumDocument, StudyCircleDocument } from "../../modules/education/models/types";

export async function saveStudyCircle(doc: StudyCircleDocument): Promise<void> {
    const yDoc = await open(doc.roomId, "study-circle", doc.id);
    yDoc.getMap("study-circle").set("document", JSON.stringify(doc));
}

export async function loadStudyCircle(roomId: string, id: string): Promise<StudyCircleDocument | undefined> {
    const yDoc = await open(roomId, "study-circle", id);
    const raw = yDoc.getMap("study-circle").get("document");
    return typeof raw === "string" ? (JSON.parse(raw) as StudyCircleDocument) : undefined;
}

export async function saveCurriculum(doc: CurriculumDocument, roomId: string): Promise<void> {
    const yDoc = await open(roomId, "curriculum", doc.studyCircleId);
    yDoc.getMap("curriculum").set("document", JSON.stringify(doc));
}

export async function loadCurriculum(roomId: string, studyCircleId: string): Promise<CurriculumDocument | undefined> {
    const yDoc = await open(roomId, "curriculum", studyCircleId);
    const raw = yDoc.getMap("curriculum").get("document");
    return typeof raw === "string" ? (JSON.parse(raw) as CurriculumDocument) : undefined;
}
