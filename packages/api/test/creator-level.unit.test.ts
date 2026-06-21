import test from 'node:test';
import assert from 'node:assert/strict';

import {
    creatorLevelFromReputation,
    creatorSkillsFromReputation,
    cumulativeXpForLevel,
    levelFromXp,
    type ReputationProfile,
} from '@blackout/core';

test('creator level: cumulative curve and inversion line up with tier thresholds', () => {
    assert.equal(cumulativeXpForLevel(1), 0);
    assert.equal(cumulativeXpForLevel(2), 100);
    assert.equal(cumulativeXpForLevel(4), 600);
    assert.equal(cumulativeXpForLevel(5), 1000);

    assert.equal(levelFromXp(0), 1);
    assert.equal(levelFromXp(99), 1);
    assert.equal(levelFromXp(100), 2);
    assert.equal(levelFromXp(1000), 5);
});

test('creator level: derives level, title and progress from reputation overall', () => {
    const rep: ReputationProfile = {
        overall: { score: 150, tier: 'vendor' },
        bySubject: {},
    };
    const level = creatorLevelFromReputation(rep);
    assert.equal(level.level, 2);
    assert.equal(level.xp, 150);
    assert.equal(level.tier, 'vendor');
    assert.equal(level.title, 'Established Creator');
    assert.equal(level.xpIntoLevel, 50); // 150 - cumulative(2)=100
    assert.equal(level.xpForNextLevel, 200); // cumulative(3)=300 - 100
});

test('creator level: empty/absent reputation is a safe level-1 newcomer', () => {
    const level = creatorLevelFromReputation(null);
    assert.equal(level.level, 1);
    assert.equal(level.xp, 0);
    assert.equal(level.title, 'Rising Creator');
    assert.ok(level.xpForNextLevel >= 1);
});

test('creator skills: per-subject standings ranked high → low, zero-scores dropped', () => {
    const rep: ReputationProfile = {
        overall: { score: 30, tier: 'member' },
        bySubject: {
            tech: { score: 20, tier: 'member' },
            economy: { score: 10, tier: 'member' },
            culture: { score: 0, tier: 'member' },
        },
    };
    const skills = creatorSkillsFromReputation(rep);
    assert.deepEqual(
        skills.map((s) => s.subject),
        ['tech', 'economy']
    );
});
