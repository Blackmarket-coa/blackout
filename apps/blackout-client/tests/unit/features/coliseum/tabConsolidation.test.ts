import { describe, expect, it } from 'vitest';
import { COLISEUM_TABS } from '@blackout/core';
import {
    PRIMARY_COLISEUM_TABS,
    SECONDARY_COLISEUM_TABS,
    splitColiseumTabs,
} from '../../../../src/app/features/coliseum/tabConsolidation';

describe('splitColiseumTabs', () => {
    it('splits the full tab set into 5 primary + specialist secondary, dropping debate', () => {
        const { primary, secondary } = splitColiseumTabs([...COLISEUM_TABS]);
        expect(primary).toEqual(['reel', 'topics', 'knowledge', 'live', 'challenges']);
        expect(secondary).toEqual(['arena', 'match', 'shouts', 'leaderboards', 'sources']);
        expect([...primary, ...secondary]).not.toContain('debate');
    });

    it('respects per-den enabledTabs gating', () => {
        const { primary, secondary } = splitColiseumTabs(['topics', 'debate', 'live']);
        expect(primary).toEqual(['topics', 'live']);
        expect(secondary).toEqual([]);
    });

    it('promotes secondary tabs when a den enables only specialist surfaces', () => {
        // The promotion cap tracks PRIMARY_COLISEUM_TABS.length (currently 5),
        // so all five specialist tabs fit the strip and nothing overflows.
        const { primary, secondary } = splitColiseumTabs([
            'arena',
            'match',
            'shouts',
            'leaderboards',
            'sources',
        ]);
        expect(primary).toEqual(['arena', 'match', 'shouts', 'leaderboards', 'sources']);
        expect(secondary).toEqual([]);
    });

    it('covers every tab id exactly once across the two constant lists (minus debate)', () => {
        const all = [...PRIMARY_COLISEUM_TABS, ...SECONDARY_COLISEUM_TABS, 'debate'].sort();
        expect(all).toEqual([...COLISEUM_TABS].sort());
    });
});
