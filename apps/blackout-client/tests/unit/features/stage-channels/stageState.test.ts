import { describe, expect, it } from 'vitest';
import {
    canSpeak,
    parseStageConfig,
    promoteToPresenter,
    removeFromStage,
    resolveStageRoster,
    toggleRequest,
} from '../../../../src/app/features/stage-channels/stageState';

describe('parseStageConfig', () => {
    it('keeps only valid, unique user ids', () => {
        const config = parseStageConfig({
            presenters: ['@a:srv', '@a:srv', 'bad', 42],
            requests: ['@b:srv'],
        } as never);
        expect(config.presenters).toEqual(['@a:srv']);
        expect(config.requests).toEqual(['@b:srv']);
    });

    it('defaults to empty arrays', () => {
        expect(parseStageConfig(undefined)).toEqual({ presenters: [], requests: [] });
    });
});

describe('resolveStageRoster', () => {
    it('puts presenters and moderators in speakers, rest in audience', () => {
        const config = { presenters: ['@p:srv'], requests: [] };
        const members = [
            { userId: '@mod:srv', powerLevel: 100 },
            { userId: '@p:srv', powerLevel: 0 },
            { userId: '@listener:srv', powerLevel: 0 },
        ];
        const roster = resolveStageRoster(config, members);
        expect(roster.speakers.sort()).toEqual(['@mod:srv', '@p:srv']);
        expect(roster.audience).toEqual(['@listener:srv']);
    });
});

describe('canSpeak', () => {
    const config = { presenters: ['@p:srv'], requests: [] };
    it('is true for presenters and moderators', () => {
        expect(canSpeak(config, '@p:srv', 0)).toBe(true);
        expect(canSpeak(config, '@mod:srv', 50)).toBe(true);
    });
    it('is false for audience', () => {
        expect(canSpeak(config, '@x:srv', 0)).toBe(false);
    });
});

describe('mutations', () => {
    const base = { presenters: ['@p:srv'], requests: ['@r:srv'] };

    it('toggles a speak request', () => {
        expect(toggleRequest(base, '@new:srv').requests).toContain('@new:srv');
        expect(toggleRequest(base, '@r:srv').requests).not.toContain('@r:srv');
        expect(toggleRequest(base, 'invalid')).toEqual(base);
    });

    it('promotes a requester to presenter and clears the request', () => {
        const next = promoteToPresenter(base, '@r:srv');
        expect(next.presenters).toContain('@r:srv');
        expect(next.requests).not.toContain('@r:srv');
    });

    it('removes a user from the stage entirely', () => {
        const next = removeFromStage({ presenters: ['@p:srv'], requests: ['@p:srv'] }, '@p:srv');
        expect(next.presenters).not.toContain('@p:srv');
        expect(next.requests).not.toContain('@p:srv');
    });
});
