import test from 'node:test';
import assert from 'node:assert/strict';

import {
    SURGE_MIN_SUPPORTS,
    computeProjectMomentum,
    detectSurge,
    endowedProgressFraming,
    evaluateMilestones,
    nextMilestone,
    projectProgress,
    type ProjectMilestone,
} from '@blackout/core';

const NOW = Date.parse('2026-05-02T12:00:00Z');

test('detectSurge fires only when accelerating AND above the min-support floor', () => {
    // Strong acceleration, enough volume → surging.
    assert.equal(detectSurge({ supportsLast24h: 8, supportsPrev24h: 1 }).surging, true);
    // Same acceleration shape but below the volume floor → not a surge.
    assert.equal(
        detectSurge({ supportsLast24h: SURGE_MIN_SUPPORTS - 1, supportsPrev24h: 0 }).surging,
        false
    );
    // Steady support (no acceleration) → not surging even with volume.
    assert.equal(detectSurge({ supportsLast24h: 10, supportsPrev24h: 10 }).surging, false);
    // Cooling → not surging.
    assert.equal(detectSurge({ supportsLast24h: 2, supportsPrev24h: 20 }).surging, false);
});

test('projectProgress clamps and handles missing/zero goals', () => {
    assert.equal(projectProgress({ fundingGoalCents: 10000, raisedCents: 2500 }), 0.25);
    assert.equal(projectProgress({ fundingGoalCents: 10000, raisedCents: 15000 }), 1);
    assert.equal(projectProgress({ fundingGoalCents: 0, raisedCents: 500 }), 0);
    assert.equal(projectProgress({ raisedCents: 500 }), 0);
});

test('evaluateMilestones stamps newly crossed milestones once, leaves others', () => {
    const milestones: ProjectMilestone[] = [
        { id: 'a', label: 'Seeded', thresholdCents: 1000 },
        { id: 'b', label: 'Halfway', thresholdCents: 5000 },
        { id: 'c', label: 'Funded', thresholdCents: 10000 },
    ];
    const first = evaluateMilestones(milestones, 5000, '2026-05-02T12:00:00Z');
    assert.deepEqual(
        first.reached.map((m) => m.id),
        ['a', 'b']
    );
    assert.equal(first.milestones[0].reachedAt, '2026-05-02T12:00:00Z');
    assert.equal(first.milestones[2].reachedAt, undefined);

    // A later evaluation does not re-stamp already-reached milestones.
    const second = evaluateMilestones(first.milestones, 6000, '2026-05-02T13:00:00Z');
    assert.deepEqual(second.reached, []);
    assert.equal(second.milestones[0].reachedAt, '2026-05-02T12:00:00Z');
});

test('nextMilestone returns lowest unreached threshold', () => {
    const milestones: ProjectMilestone[] = [
        { id: 'c', label: 'Funded', thresholdCents: 10000 },
        { id: 'a', label: 'Seeded', thresholdCents: 1000, reachedAt: '2026-05-01T00:00:00Z' },
        { id: 'b', label: 'Halfway', thresholdCents: 5000 },
    ];
    assert.equal(nextMilestone({ milestones })?.id, 'b');
    assert.equal(nextMilestone({ milestones: [] }), undefined);
});

test('computeProjectMomentum blends recency and velocity, all clamped', () => {
    const m = computeProjectMomentum({
        createdAt: '2026-05-02T11:00:00Z',
        supportsLast24h: 48, // 2/hr → full velocity
        supportsPrev24h: 0,
        nowMs: NOW,
    });
    assert.ok(m.recencyScore > 0 && m.recencyScore <= 1);
    assert.equal(m.velocityScore, 1);
    assert.ok(m.surgeFactor > 0.9); // quiet → busy reads as a strong surge
    assert.ok(m.momentum > 0 && m.momentum <= 1);
});

test('computeProjectMomentum surgeFactor is ~0.5 when steady', () => {
    const m = computeProjectMomentum({
        createdAt: '2026-05-02T11:00:00Z',
        supportsLast24h: 10,
        supportsPrev24h: 10,
        nowMs: NOW,
    });
    assert.ok(Math.abs(m.surgeFactor - 0.5) < 0.05);
});

test('endowedProgressFraming leads with what is already enabled', () => {
    const f = endowedProgressFraming({
        raisedCents: 6200,
        goalCents: 10000,
        contributionCents: 200,
    });
    assert.ok(f);
    assert.equal(f!.percentAlreadyEnabled, 0.62);
    assert.equal(f!.contributionPercent, 0.02);
    assert.ok(f!.headStartReason.length > 0);
});

test('endowedProgressFraming returns null without a positive goal', () => {
    assert.equal(endowedProgressFraming({ raisedCents: 500, goalCents: 0 }), null);
});
