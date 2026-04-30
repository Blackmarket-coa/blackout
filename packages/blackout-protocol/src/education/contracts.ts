/**
 * Education module contracts (BKL-012).
 *
 * Mirrors `_port`'s `/blackout/education` route. The canonical client
 * gets a typed module/lesson contract so deep-links into a specific
 * lesson survive both the canonical and the legacy host.
 */

import type { EventEnvelope } from '../common/types';

export const EDUCATION_PROTOCOL_VERSION = 1 as const;

export const EDUCATION_EVENT_NAMES = {
    moduleProgress: 'co.bmc.education.module.progress',
} as const;

export type EducationEventName =
    (typeof EDUCATION_EVENT_NAMES)[keyof typeof EDUCATION_EVENT_NAMES];

export interface EducationLessonDescriptor {
    /** Stable lesson id within a module. Opaque, treated as a slug. */
    lessonId: string;
    /** Title shown in the lesson list. */
    title: string;
    /** Optional short summary for list rendering. */
    summary?: string;
    /** Estimated minutes-to-complete, informational. */
    estimatedMinutes?: number;
}

export interface EducationModuleDescriptor {
    /** Stable module id. Used in the deep-link path: `/education/:moduleId`. */
    moduleId: string;
    /** Title shown in the module directory. */
    title: string;
    /** Optional short summary. */
    summary?: string;
    /** Lessons in this module, in canonical order. */
    lessons: EducationLessonDescriptor[];
}

export interface EducationProgressPayload {
    /** Subject the progress applies to. */
    subject: string;
    /** Module the progress envelope describes. */
    moduleId: string;
    /** Lessons the subject has completed within this module. */
    completedLessonIds: string[];
    /** ISO-8601 timestamp the progress was last updated. */
    updatedAt: string;
}

export type EducationModuleProgressEvent = EventEnvelope<
    'blackout.education.module.progress',
    EducationProgressPayload
>;
