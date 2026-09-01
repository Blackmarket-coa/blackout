import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyRoleSuggestion,
    DEFAULT_PROFILE_LAYOUT,
    normalizeProfileLayout,
    paletteAvailability,
    PROFILE_BLOCK_KINDS,
    visibleBlocks,
    type ProfileMilestoneStats,
} from '@blackout/core';

test('normalizeProfileLayout keeps the owner’s order and appends unknown-to-them blocks hidden', () => {
    const stored = {
        blocks: [
            { kind: 'wall', visible: true },
            { kind: 'bio', visible: false },
        ],
    };
    const layout = normalizeProfileLayout(stored);

    // The owner's arrangement leads.
    assert.deepEqual(
        layout.blocks.slice(0, 2).map((b) => b.kind),
        ['wall', 'bio']
    );
    // A block they have never seen (added in a later release) arrives hidden,
    // so a deploy never rearranges someone's homestead for them.
    const circleMap = layout.blocks.find((b) => b.kind === 'circle_map');
    assert.equal(circleMap?.visible, false);
    // Every known block is present exactly once.
    assert.equal(layout.blocks.length, PROFILE_BLOCK_KINDS.length);
});

test('normalizeProfileLayout drops unknown kinds and collapses duplicates', () => {
    const layout = normalizeProfileLayout({
        blocks: [
            { kind: 'bio', visible: true },
            { kind: 'bio', visible: false },
            { kind: 'not_a_block', visible: true },
        ],
    });
    assert.equal(layout.blocks.filter((b) => b.kind === 'bio').length, 1);
    // First occurrence wins, so the visible one survives.
    assert.equal(layout.blocks[0]?.kind, 'bio');
    assert.equal(layout.blocks[0]?.visible, true);
    assert.equal(layout.blocks.length, PROFILE_BLOCK_KINDS.length);
});

test('normalizeProfileLayout falls back to the default set for junk input', () => {
    for (const junk of [null, undefined, {}, { blocks: 'nope' }]) {
        const layout = normalizeProfileLayout(junk);
        assert.equal(layout.blocks.length, PROFILE_BLOCK_KINDS.length);
    }
});

test('a hidden block keeps its slot so unhiding restores the arrangement', () => {
    const layout = normalizeProfileLayout({
        blocks: [
            { kind: 'wall', visible: true },
            { kind: 'bio', visible: false },
            { kind: 'links', visible: true },
        ],
    });
    assert.equal(layout.blocks[1]?.kind, 'bio');
    assert.deepEqual(visibleBlocks(layout).slice(0, 2), ['wall', 'links']);
});

test('applyRoleSuggestion promotes a role’s blocks without losing the others', () => {
    const promoted = applyRoleSuggestion(DEFAULT_PROFILE_LAYOUT, 'creator');
    assert.deepEqual(
        promoted.blocks.slice(0, 3).map((b) => b.kind),
        ['creator_shop', 'pinned_media', 'relay_wall']
    );
    // Same skeleton for every role — nothing is removed, just reordered.
    assert.equal(promoted.blocks.length, DEFAULT_PROFILE_LAYOUT.blocks.length);
});

const stats = (overrides: Partial<ProfileMilestoneStats> = {}): ProfileMilestoneStats => ({
    relaysMade: 0,
    circleSize: 0,
    circleOverlaps: 0,
    chainDepthReached: 0,
    peopleReached: 0,
    ...overrides,
});

test('paletteAvailability returns locked palettes with their progress, never hides them', () => {
    const result = paletteAvailability(stats({ circleSize: 4 }));

    const gathered = result.find((entry) => entry.palette.id === 'gathered');
    assert.equal(gathered?.unlocked, false);
    // Shown as locked with the distance stated, like the unlit remainder on the
    // Illumination meter.
    assert.deepEqual(gathered?.progress, { current: 4, required: 10 });

    // The starting palettes need nothing.
    assert.equal(result.find((e) => e.palette.id === 'canopy_floor')?.unlocked, true);
});

test('paletteAvailability unlocks on real, people-made milestones', () => {
    const unlocked = paletteAvailability(
        stats({
            relaysMade: 1,
            circleSize: 10,
            circleOverlaps: 5,
            chainDepthReached: 10,
            peopleReached: 50,
        })
    );
    assert.ok(
        unlocked.every((entry) => entry.unlocked),
        'every palette unlocks once its milestone is genuinely met'
    );
});

test('paletteAvailability is exact at the boundary', () => {
    assert.equal(
        paletteAvailability(stats({ relaysMade: 1 })).find((e) => e.palette.id === 'first_light')
            ?.unlocked,
        true
    );
    assert.equal(
        paletteAvailability(stats({ relaysMade: 0 })).find((e) => e.palette.id === 'first_light')
            ?.unlocked,
        false
    );
});
