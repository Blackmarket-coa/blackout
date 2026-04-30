import { describe, expect, it } from 'vitest';
import {
    EDUCATION_EVENT_NAMES,
    isEducationModuleProgress,
    type EducationModuleProgressEvent,
} from '@blackout/protocol';
import {
    computeModuleCompletion,
    createEducationActions,
    findNextLesson,
    type EducationModuleDescriptor,
} from '@blackout/sdk';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

const buildClient = <T>(response: T) => {
    const calls: ApiRequest[] = [];
    const apiClient: ApiClient = async (request) => {
        calls.push(request);
        return response as never;
    };
    return { apiClient, calls };
};

const module = (
    moduleId: string,
    lessonIds: string[]
): EducationModuleDescriptor => ({
    moduleId,
    title: moduleId,
    lessons: lessonIds.map((lessonId) => ({ lessonId, title: lessonId })),
});

describe('@blackout/protocol education guards (BKL-012)', () => {
    it('publishes the canonical Matrix event type', () => {
        expect(EDUCATION_EVENT_NAMES.moduleProgress).toBe('co.bmc.education.module.progress');
    });

    it('isEducationModuleProgress narrows valid envelopes', () => {
        const valid: EducationModuleProgressEvent = {
            event: 'blackout.education.module.progress',
            roomId: '!e:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                subject: '@a:srv',
                moduleId: 'm-1',
                completedLessonIds: ['l-1'],
                updatedAt: '2026-04-30T00:00:00.000Z',
            },
        };
        expect(isEducationModuleProgress(valid)).toBe(true);
        expect(
            isEducationModuleProgress({
                ...valid,
                payload: { ...valid.payload, completedLessonIds: 'not-an-array' as unknown },
            })
        ).toBe(false);
    });
});

describe('createEducationActions', () => {
    it('listModules + listProgress hit the canonical paths', async () => {
        const { apiClient, calls } = buildClient({ subject: '@a:srv', modules: [] });
        const actions = createEducationActions(apiClient);

        await actions.listModules();
        expect(calls.at(-1)).toEqual({ method: 'GET', path: '/v1/education/modules' });

        await actions.listProgress();
        expect(calls.at(-1)).toEqual({ method: 'GET', path: '/v1/education/progress' });
    });

    it('completeLesson encodes module + lesson segments', async () => {
        const { apiClient, calls } = buildClient<unknown>({});
        const actions = createEducationActions(apiClient);
        await actions.completeLesson('m 1', 'l 9');
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: `/v1/education/modules/${encodeURIComponent('m 1')}/lessons/${encodeURIComponent('l 9')}/complete`,
            body: {},
        });
    });
});

describe('computeModuleCompletion', () => {
    it('returns 0 for empty modules', () => {
        expect(computeModuleCompletion(module('m', []), [])).toBe(0);
    });

    it('returns the completion fraction', () => {
        expect(computeModuleCompletion(module('m', ['a', 'b', 'c', 'd']), ['a', 'c'])).toBe(0.5);
    });

    it('ignores lessons not in the module', () => {
        expect(
            computeModuleCompletion(module('m', ['a', 'b']), ['a', 'rogue'])
        ).toBe(0.5);
    });
});

describe('findNextLesson', () => {
    it('returns the first incomplete lesson', () => {
        expect(
            findNextLesson(module('m', ['a', 'b', 'c']), ['a'])?.lessonId
        ).toBe('b');
    });

    it('returns null when every lesson is complete', () => {
        expect(findNextLesson(module('m', ['a']), ['a'])).toBeNull();
    });
});
