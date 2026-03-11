/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface StudyCircleDocument {
    id: string;
    roomId: string;
    title: string;
    tags: string[];
    facilitators: string[];
    createdAt: number;
    updatedAt: number;
}

export interface CurriculumDocument {
    studyCircleId: string;
    sections: Array<{
        id: string;
        title: string;
        markdown: string;
    }>;
    updatedAt: number;
}
