/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useMemo, useState } from "react";

import type { CurriculumDocument, StudyCircleDocument } from "../models/types";

const ROOM_ID = "!blackout-education:local";

export default function EducationHome(): React.JSX.Element {
    const [studyCircles, setStudyCircles] = useState<StudyCircleDocument[]>([]);
    const [curriculaByStudyCircleId, setCurriculaByStudyCircleId] = useState<Record<string, CurriculumDocument>>({});
    const [selectedStudyCircleId, setSelectedStudyCircleId] = useState<string>();
    const [circleTitle, setCircleTitle] = useState("");
    const [sectionTitle, setSectionTitle] = useState("");
    const [sectionMarkdown, setSectionMarkdown] = useState("");

    const selectedStudyCircle = useMemo(
        () => studyCircles.find((circle) => circle.id === selectedStudyCircleId),
        [selectedStudyCircleId, studyCircles],
    );

    const selectedCurriculum = selectedStudyCircleId ? curriculaByStudyCircleId[selectedStudyCircleId] : undefined;

    const handleCreateStudyCircle = (): void => {
        if (!circleTitle.trim()) return;

        const now = Date.now();
        const studyCircle: StudyCircleDocument = {
            id: `circle-${now}`,
            roomId: ROOM_ID,
            title: circleTitle.trim(),
            tags: [],
            facilitators: [],
            createdAt: now,
            updatedAt: now,
        };

        setStudyCircles((current) => [studyCircle, ...current]);
        setCurriculaByStudyCircleId((current) => ({
            ...current,
            [studyCircle.id]: {
                studyCircleId: studyCircle.id,
                sections: [],
                updatedAt: now,
            },
        }));
        setSelectedStudyCircleId(studyCircle.id);
        setCircleTitle("");
    };

    const handleAddSection = (): void => {
        if (!selectedStudyCircle || !sectionTitle.trim() || !sectionMarkdown.trim()) {
            return;
        }

        const existing = curriculaByStudyCircleId[selectedStudyCircle.id];
        if (!existing) return;

        const now = Date.now();
        setCurriculaByStudyCircleId((current) => ({
            ...current,
            [selectedStudyCircle.id]: {
                ...existing,
                sections: [
                    ...existing.sections,
                    {
                        id: `section-${now}`,
                        title: sectionTitle.trim(),
                        markdown: sectionMarkdown.trim(),
                    },
                ],
                updatedAt: now,
            },
        }));
        setSectionTitle("");
        setSectionMarkdown("");
    };

    return (
        <section data-testid="blackout-education-view">
            <h2>Education</h2>
            <p>Study circles and collaborative curriculum drafts.</p>
            <div>
                <input
                    value={circleTitle}
                    onChange={(event) => setCircleTitle(event.target.value)}
                    placeholder="New study circle"
                    data-testid="blackout-education-circle-title"
                />
                <button type="button" onClick={handleCreateStudyCircle} data-testid="blackout-education-create-circle">
                    Create study circle
                </button>
            </div>

            <ul data-testid="blackout-education-circles">
                {studyCircles.map((circle) => (
                    <li key={circle.id}>
                        <button type="button" onClick={() => setSelectedStudyCircleId(circle.id)}>
                            {circle.title}
                        </button>
                    </li>
                ))}
            </ul>

            {selectedStudyCircle && (
                <section data-testid="blackout-education-curriculum">
                    <h3>{selectedStudyCircle.title} curriculum</h3>
                    <input
                        value={sectionTitle}
                        onChange={(event) => setSectionTitle(event.target.value)}
                        placeholder="Section title"
                        data-testid="blackout-education-section-title"
                    />
                    <textarea
                        value={sectionMarkdown}
                        onChange={(event) => setSectionMarkdown(event.target.value)}
                        placeholder="Section markdown"
                        data-testid="blackout-education-section-markdown"
                    />
                    <button type="button" onClick={handleAddSection} data-testid="blackout-education-add-section">
                        Add section
                    </button>

                    <ol>
                        {selectedCurriculum?.sections.map((section) => (
                            <li key={section.id}>
                                <strong>{section.title}</strong>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </section>
    );
}
