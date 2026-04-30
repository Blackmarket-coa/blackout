import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    computeModuleCompletion,
    findNextLesson,
    type EducationModuleDescriptor,
    type EducationProgressPayload,
} from '@blackout/sdk';

export type EducationFetcher = {
    listModules: () => Promise<{ modules: EducationModuleDescriptor[] }>;
    listProgress: () => Promise<{ progress: EducationProgressPayload[] }>;
    completeLesson: (moduleId: string, lessonId: string) => Promise<unknown>;
};

type Props = {
    fetcher?: EducationFetcher;
};

const stub: EducationFetcher = {
    listModules: async () => ({ modules: [] }),
    listProgress: async () => ({ progress: [] }),
    completeLesson: async () => ({}),
};

export function EducationPage({ fetcher = stub }: Props) {
    const [modules, setModules] = useState<EducationModuleDescriptor[]>([]);
    const [progress, setProgress] = useState<EducationProgressPayload[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const [catalog, progressResponse] = await Promise.all([
                fetcher.listModules(),
                fetcher.listProgress(),
            ]);
            setModules(catalog.modules ?? []);
            setProgress(progressResponse.progress ?? []);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Failed to load education.');
        }
    }, [fetcher]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const progressByModule = useMemo(() => {
        const map = new Map<string, string[]>();
        progress.forEach((entry) => {
            map.set(entry.moduleId, entry.completedLessonIds);
        });
        return map;
    }, [progress]);

    const onComplete = useCallback(
        async (moduleId: string, lessonId: string) => {
            setActionError(null);
            const compositeId = `${moduleId}/${lessonId}`;
            setPending(compositeId);
            try {
                await fetcher.completeLesson(moduleId, lessonId);
                // Optimistic merge — append to local progress for the module.
                setProgress((prev) => {
                    const existing = prev.find((entry) => entry.moduleId === moduleId);
                    if (!existing) {
                        return [
                            ...prev,
                            {
                                subject: '',
                                moduleId,
                                completedLessonIds: [lessonId],
                                updatedAt: new Date().toISOString(),
                            },
                        ];
                    }
                    if (existing.completedLessonIds.includes(lessonId)) return prev;
                    return prev.map((entry) =>
                        entry.moduleId === moduleId
                            ? {
                                  ...entry,
                                  completedLessonIds: [...entry.completedLessonIds, lessonId],
                                  updatedAt: new Date().toISOString(),
                              }
                            : entry
                    );
                });
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : `Failed to complete ${lessonId}.`
                );
            } finally {
                setPending(null);
            }
        },
        [fetcher]
    );

    return (
        <main
            data-testid="education-page"
            style={{ padding: 16, display: 'grid', gap: 16 }}
        >
            <header>
                <h1 style={{ margin: 0 }}>Education</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Modules + lessons. Mirrors `_port`'s `/blackout/education` route.
                </p>
            </header>

            {loadError ? (
                <p data-testid="education-load-error" role="alert">
                    {loadError}
                </p>
            ) : null}
            {actionError ? (
                <p data-testid="education-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            {modules.length === 0 ? (
                <p data-testid="education-empty" style={{ color: 'var(--text-secondary)' }}>
                    No education modules available.
                </p>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
                    {modules.map((module) => {
                        const done = progressByModule.get(module.moduleId) ?? [];
                        const completion = computeModuleCompletion(module, done);
                        const next = findNextLesson(module, done);
                        return (
                            <li
                                key={module.moduleId}
                                data-testid={`education-module-${module.moduleId}`}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 10,
                                    padding: 12,
                                    display: 'grid',
                                    gap: 6,
                                }}
                            >
                                <header
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                    }}
                                >
                                    <strong>{module.title}</strong>
                                    <small data-testid={`education-progress-${module.moduleId}`}>
                                        {Math.round(completion * 100)}% complete
                                    </small>
                                </header>
                                {module.summary ? (
                                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                        {module.summary}
                                    </p>
                                ) : null}
                                {next ? (
                                    <small
                                        data-testid={`education-next-${module.moduleId}`}
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Next up: {next.title}
                                    </small>
                                ) : (
                                    <small
                                        data-testid={`education-complete-${module.moduleId}`}
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Module complete.
                                    </small>
                                )}
                                <ul
                                    style={{
                                        listStyle: 'none',
                                        margin: 0,
                                        padding: 0,
                                        display: 'grid',
                                        gap: 4,
                                    }}
                                >
                                    {module.lessons.map((lesson) => {
                                        const completed = done.includes(lesson.lessonId);
                                        const compositeId = `${module.moduleId}/${lesson.lessonId}`;
                                        return (
                                            <li
                                                key={lesson.lessonId}
                                                data-testid={`education-lesson-${module.moduleId}-${lesson.lessonId}`}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    gap: 6,
                                                }}
                                            >
                                                <span>
                                                    {completed ? '✓ ' : '○ '}
                                                    {lesson.title}
                                                </span>
                                                <button
                                                    type="button"
                                                    data-testid={`education-complete-button-${module.moduleId}-${lesson.lessonId}`}
                                                    onClick={() =>
                                                        void onComplete(
                                                            module.moduleId,
                                                            lesson.lessonId
                                                        )
                                                    }
                                                    disabled={
                                                        completed || pending === compositeId
                                                    }
                                                >
                                                    {completed
                                                        ? 'Done'
                                                        : pending === compositeId
                                                        ? 'Saving…'
                                                        : 'Mark complete'}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}

export default EducationPage;
