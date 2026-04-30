// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    EducationPage,
    type EducationFetcher,
} from '../../../../src/app/features/education';
import type {
    EducationModuleDescriptor,
    EducationProgressPayload,
} from '@blackout/sdk';

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(ui);
        await Promise.resolve();
        await Promise.resolve();
    });
    return { container, root };
};

const buildModule = (
    moduleId: string,
    lessonIds: string[]
): EducationModuleDescriptor => ({
    moduleId,
    title: `Module ${moduleId}`,
    lessons: lessonIds.map((lessonId) => ({ lessonId, title: `Lesson ${lessonId}` })),
});

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('EducationPage (BKL-012 finished UI)', () => {
    it('renders empty-state when there are no modules', async () => {
        const fetcher: EducationFetcher = {
            listModules: vi.fn(async () => ({ modules: [] })),
            listProgress: vi.fn(async () => ({ progress: [] })),
            completeLesson: vi.fn(),
        };
        const { container } = await mount(<EducationPage fetcher={fetcher} />);
        expect(container.querySelector('[data-testid="education-page"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="education-empty"]')).toBeTruthy();
    });

    it('renders module + lesson list with progress and next-lesson hint', async () => {
        const fetcher: EducationFetcher = {
            listModules: vi.fn(async () => ({
                modules: [buildModule('intro', ['a', 'b', 'c', 'd'])],
            })),
            listProgress: vi.fn(async () => ({
                progress: [
                    {
                        subject: '@a:srv',
                        moduleId: 'intro',
                        completedLessonIds: ['a', 'b'],
                        updatedAt: '2026-04-30T00:00:00.000Z',
                    } as EducationProgressPayload,
                ],
            })),
            completeLesson: vi.fn(),
        };

        const { container } = await mount(<EducationPage fetcher={fetcher} />);
        expect(container.querySelector('[data-testid="education-progress-intro"]')?.textContent).toContain(
            '50%'
        );
        expect(container.querySelector('[data-testid="education-next-intro"]')?.textContent).toContain(
            'Lesson c'
        );
        // Completed lessons render with the Done button disabled.
        const aButton = container.querySelector(
            '[data-testid="education-complete-button-intro-a"]'
        ) as HTMLButtonElement;
        expect(aButton.disabled).toBe(true);
        expect(aButton.textContent).toContain('Done');
    });

    it('marks a lesson complete and advances progress optimistically', async () => {
        const fetcher: EducationFetcher = {
            listModules: vi.fn(async () => ({
                modules: [buildModule('intro', ['a', 'b'])],
            })),
            listProgress: vi.fn(async () => ({ progress: [] })),
            completeLesson: vi.fn(async () => ({})),
        };
        const { container } = await mount(<EducationPage fetcher={fetcher} />);

        const button = container.querySelector(
            '[data-testid="education-complete-button-intro-a"]'
        ) as HTMLButtonElement;

        await act(async () => {
            button.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.completeLesson).toHaveBeenCalledWith('intro', 'a');
        expect(container.querySelector('[data-testid="education-progress-intro"]')?.textContent).toContain(
            '50%'
        );
    });

    it('shows module-complete hint when every lesson is done', async () => {
        const fetcher: EducationFetcher = {
            listModules: vi.fn(async () => ({
                modules: [buildModule('intro', ['a'])],
            })),
            listProgress: vi.fn(async () => ({
                progress: [
                    {
                        subject: '@a:srv',
                        moduleId: 'intro',
                        completedLessonIds: ['a'],
                        updatedAt: '2026-04-30T00:00:00.000Z',
                    } as EducationProgressPayload,
                ],
            })),
            completeLesson: vi.fn(),
        };
        const { container } = await mount(<EducationPage fetcher={fetcher} />);
        expect(container.querySelector('[data-testid="education-complete-intro"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="education-next-intro"]')).toBeNull();
    });
});
