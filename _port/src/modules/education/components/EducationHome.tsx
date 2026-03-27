/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useEffect, useMemo, useState } from "react";

import {
    loadCurriculum,
    loadStudyCircle,
    saveCurriculum,
    saveStudyCircle,
} from "../../../services/crdt/educationBinding";
import type { CurriculumDocument, StudyCircleDocument } from "../models/types";

const ROOM_ID = "!blackout-education:local";
const CURRENT_USER_ID = "@me:blackout.local";

function hasCurriculumAccess(circle: StudyCircleDocument): boolean {
    return circle.facilitators.length === 0 || circle.facilitators.includes(CURRENT_USER_ID);
}

export default function EducationHome(): React.JSX.Element {
    const [studyCircles, setStudyCircles] = useState<StudyCircleDocument[]>([]);
    const [curriculaByStudyCircleId, setCurriculaByStudyCircleId] = useState<Record<string, CurriculumDocument>>({});
    const [selectedStudyCircleId, setSelectedStudyCircleId] = useState<string>();
    const [selectedSectionId, setSelectedSectionId] = useState<string>();
    const [activeTab, setActiveTab] = useState<"study_circles" | "lessons" | "resources">("study_circles");
    const [circleTitle, setCircleTitle] = useState("");
    const [sectionTitle, setSectionTitle] = useState("");
    const [sectionMarkdown, setSectionMarkdown] = useState("");

    const selectedStudyCircle = useMemo(
        () => studyCircles.find((circle) => circle.id === selectedStudyCircleId),
        [selectedStudyCircleId, studyCircles],
    );

    const selectedCurriculum = selectedStudyCircleId ? curriculaByStudyCircleId[selectedStudyCircleId] : undefined;
    const canCreateCircle = Boolean(circleTitle.trim());
    const canSaveSection = Boolean(
        selectedStudyCircle && selectedCurriculum && sectionTitle.trim() && sectionMarkdown.trim(),
    );

    useEffect(() => {
        if (!selectedStudyCircleId) {
            return;
        }

        loadStudyCircle(ROOM_ID, selectedStudyCircleId).then((doc) => {
            if (doc) {
                setStudyCircles((current) =>
                    current.some((circle) => circle.id === doc.id)
                        ? current.map((circle) => (circle.id === doc.id ? doc : circle))
                        : [doc, ...current],
                );
            }
        });

        loadCurriculum(ROOM_ID, selectedStudyCircleId).then((doc) => {
            if (doc) {
                setCurriculaByStudyCircleId((current) => ({ ...current, [selectedStudyCircleId]: doc }));
            }
        });
    }, [selectedStudyCircleId]);

    const handleCreateStudyCircle = async (): Promise<void> => {
        if (!circleTitle.trim()) return;

        const now = Date.now();
        const studyCircle: StudyCircleDocument = {
            id: `circle-${now}`,
            roomId: ROOM_ID,
            title: circleTitle.trim(),
            tags: [],
            facilitators: [CURRENT_USER_ID],
            createdAt: now,
            updatedAt: now,
        };

        const curriculum: CurriculumDocument = {
            studyCircleId: studyCircle.id,
            sections: [],
            updatedAt: now,
        };

        await saveStudyCircle(studyCircle);
        await saveCurriculum(curriculum, ROOM_ID);

        setStudyCircles((current) => [studyCircle, ...current]);
        setCurriculaByStudyCircleId((current) => ({ ...current, [studyCircle.id]: curriculum }));
        setSelectedStudyCircleId(studyCircle.id);
        setCircleTitle("");
    };

    const handleUpsertSection = async (): Promise<void> => {
        if (!selectedStudyCircle || !selectedCurriculum || !sectionTitle.trim() || !sectionMarkdown.trim()) {
            return;
        }

        if (!hasCurriculumAccess(selectedStudyCircle)) {
            return;
        }

        const now = Date.now();
        const nextSectionId = selectedSectionId ?? `section-${now}`;
        const mergedSections = selectedCurriculum.sections.some((section) => section.id === nextSectionId)
            ? selectedCurriculum.sections.map((section) =>
                  section.id === nextSectionId
                      ? { ...section, title: sectionTitle.trim(), markdown: sectionMarkdown.trim() }
                      : section,
              )
            : [
                  ...selectedCurriculum.sections,
                  {
                      id: nextSectionId,
                      title: sectionTitle.trim(),
                      markdown: sectionMarkdown.trim(),
                  },
              ];

        const nextDoc: CurriculumDocument = {
            ...selectedCurriculum,
            sections: mergedSections,
            updatedAt: now,
        };

        await saveCurriculum(nextDoc, ROOM_ID);
        setCurriculaByStudyCircleId((current) => ({ ...current, [selectedStudyCircle.id]: nextDoc }));
        setSelectedSectionId(undefined);
        setSectionTitle("");
        setSectionMarkdown("");
    };

    const handleSelectSection = (sectionId: string): void => {
        if (!selectedCurriculum) {
            return;
        }

        const section = selectedCurriculum.sections.find((candidate) => candidate.id === sectionId);
        if (!section) {
            return;
        }

        setSelectedSectionId(section.id);
        setSectionTitle(section.title);
        setSectionMarkdown(section.markdown);
    };

    return (
        <section data-testid="blackout-education-view">
            <h2>Education</h2>
            <p>Study circles and collaborative curriculum drafts.</p>

            <nav>
                <button type="button" onClick={() => setActiveTab("study_circles")}>
                    Study circles
                </button>
                <button type="button" onClick={() => setActiveTab("lessons")}>
                    Lessons
                </button>
                <button type="button" onClick={() => setActiveTab("resources")}>
                    Resources
                </button>
            </nav>

            {activeTab === "study_circles" && (
                <div>
                    <input
                        value={circleTitle}
                        onChange={(event) => setCircleTitle(event.target.value)}
                        placeholder="New study circle"
                        data-testid="blackout-education-circle-title"
                    />
                    <button
                        type="button"
                        onClick={() => void handleCreateStudyCircle()}
                        disabled={!canCreateCircle}
                        data-testid="blackout-education-create-circle"
                    >
                        Create study circle
                    </button>
                </div>
            )}

            <ul data-testid="blackout-education-circles">
                {studyCircles.length === 0 && <li>No study circles yet.</li>}
                {studyCircles.map((circle) => (
                    <li key={circle.id}>
                        <button type="button" onClick={() => setSelectedStudyCircleId(circle.id)}>
                            {circle.title}
                        </button>
                    </li>
                ))}
            </ul>

            {selectedStudyCircle && activeTab !== "resources" && (
                <section data-testid="blackout-education-curriculum">
                    <h3>{selectedStudyCircle.title} curriculum</h3>
                    {!hasCurriculumAccess(selectedStudyCircle) && (
                        <p>You do not have access to edit this curriculum.</p>
                    )}
                    {hasCurriculumAccess(selectedStudyCircle) && (
                        <>
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
                            <button
                                type="button"
                                onClick={() => void handleUpsertSection()}
                                disabled={!canSaveSection}
                                data-testid="blackout-education-add-section"
                            >
                                {selectedSectionId ? "Save section" : "Add section"}
                            </button>
                        </>
                    )}

                    <ol>
                        {selectedCurriculum?.sections.length === 0 && <li>No sections yet.</li>}
                        {selectedCurriculum?.sections.map((section) => (
                            <li key={section.id}>
                                <strong>{section.title}</strong>
                                {hasCurriculumAccess(selectedStudyCircle) && (
                                    <button type="button" onClick={() => handleSelectSection(section.id)}>
                                        Edit
                                    </button>
                                )}
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </section>
    );
}
