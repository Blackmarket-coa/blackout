import type {
    EducationLessonDescriptor,
    EducationModuleDescriptor,
    EducationModuleProgressEvent,
    EducationProgressPayload,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export type EducationCatalogResponse = {
    subject: string;
    modules: EducationModuleDescriptor[];
};

export type EducationProgressResponse = {
    subject: string;
    progress: EducationProgressPayload[];
};

export const createEducationActions = (client: ApiClient) => ({
    /**
     * Fetch the education catalog (modules + their lessons). Backed by
     * `GET /v1/education/modules`.
     */
    listModules: () =>
        client<EducationCatalogResponse>({
            method: 'GET',
            path: '/v1/education/modules',
        }),
    /**
     * Fetch the subject's progress across all modules. Backed by
     * `GET /v1/education/progress`.
     */
    listProgress: () =>
        client<EducationProgressResponse>({
            method: 'GET',
            path: '/v1/education/progress',
        }),
    /**
     * Mark a lesson complete within a module. Server emits a
     * `blackout.education.module.progress` envelope.
     */
    completeLesson: (moduleId: string, lessonId: string) =>
        client<EducationModuleProgressEvent>({
            method: 'POST',
            path: `/v1/education/modules/${encodeURIComponent(moduleId)}/lessons/${encodeURIComponent(lessonId)}/complete`,
            body: {},
        }),
});

/**
 * Pure helper: returns the completion fraction (0 → 1) for a module
 * given the subject's `completedLessonIds`. Returns 0 for empty modules.
 */
export const computeModuleCompletion = (
    module: EducationModuleDescriptor,
    completedLessonIds: readonly string[]
): number => {
    const total = module.lessons.length;
    if (total === 0) return 0;
    const set = new Set(completedLessonIds);
    const done = module.lessons.filter((lesson) => set.has(lesson.lessonId)).length;
    return done / total;
};

/**
 * Pure helper: returns the next incomplete lesson for a module given
 * the subject's `completedLessonIds`. Returns `null` when every lesson
 * is complete. Used to drive the "continue where you left off" CTA.
 */
export const findNextLesson = (
    module: EducationModuleDescriptor,
    completedLessonIds: readonly string[]
): EducationLessonDescriptor | null => {
    const set = new Set(completedLessonIds);
    return module.lessons.find((lesson) => !set.has(lesson.lessonId)) ?? null;
};

export type {
    EducationLessonDescriptor,
    EducationModuleDescriptor,
    EducationModuleProgressEvent,
    EducationProgressPayload,
};
