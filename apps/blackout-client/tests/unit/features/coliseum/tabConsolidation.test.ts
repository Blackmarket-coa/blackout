import { describe, expect, it } from 'vitest';
import { COLISEUM_TABS } from '@blackout/core';
import {
    PRIMARY_COLISEUM_TABS,
    TOPIC_SECTION_COLISEUM_TABS,
    splitColiseumTabs,
} from '../../../../src/app/features/coliseum/tabConsolidation';

describe('splitColiseumTabs', () => {
    it('puts the five cross-topic surfaces on the strip and nothing in an overflow', () => {
        const { primary, secondary } = splitColiseumTabs([...COLISEUM_TABS]);
        expect(primary).toEqual(['topics', 'reel', 'knowledge', 'challenges', 'leaderboards']);
        // The "More" sheet is gone — that overflow is what ran off the side of
        // a phone and is the reason this consolidation exists.
        expect(secondary).toEqual([]);
    });

    it('keeps every topic-scoped surface off the strip', () => {
        const { primary } = splitColiseumTabs([...COLISEUM_TABS]);
        for (const tab of TOPIC_SECTION_COLISEUM_TABS) {
            expect(primary).not.toContain(tab);
        }
    });

    it('keeps challenges on the strip — it is the one surface with no topic to hang off', () => {
        // `ColiseumChallenge` has no `topicId`: it is a parallel entity
        // ("start a business", "grow food"), not a child of a topic.
        const { primary } = splitColiseumTabs([...COLISEUM_TABS]);
        expect(primary).toContain('challenges');
    });

    it('respects per-den enabledTabs gating', () => {
        const { primary, secondary } = splitColiseumTabs(['topics', 'debate', 'knowledge']);
        expect(primary).toEqual(['topics', 'knowledge']);
        expect(secondary).toEqual([]);
    });

    it('preserves the strip order regardless of the order a den enables tabs in', () => {
        const { primary } = splitColiseumTabs(['leaderboards', 'topics', 'reel']);
        expect(primary).toEqual(['topics', 'reel', 'leaderboards']);
    });

    it('falls back to the topics feed when a den enables only topic-section tabs', () => {
        // Otherwise the surface would render an empty tab bar.
        const { primary, secondary } = splitColiseumTabs(['arena', 'match', 'shouts', 'sources']);
        expect(primary).toEqual(['topics']);
        expect(secondary).toEqual([]);
    });

    it('accounts for every tab id across the strip and the topic sections', () => {
        const all = [...PRIMARY_COLISEUM_TABS, ...TOPIC_SECTION_COLISEUM_TABS].sort();
        expect(all).toEqual([...COLISEUM_TABS].sort());
    });
});
