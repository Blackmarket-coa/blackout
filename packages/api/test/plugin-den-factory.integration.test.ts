import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEN_CLASSIFICATION_STATE_EVENT_TYPE,
    PLUGIN_DEN_PURPOSES,
    isPluginDenPurpose,
    planPluginDens,
} from '@blackout/core';

test('PLUGIN_DEN_PURPOSES round-trips through the guard', () => {
    for (const purpose of PLUGIN_DEN_PURPOSES) {
        assert.equal(isPluginDenPurpose(purpose), true);
    }
    assert.equal(isPluginDenPurpose('nonsense'), false);
});

test('planPluginDens returns empty for missing or empty specs', () => {
    assert.deepEqual(planPluginDens(undefined, 'My Plugin'), []);
    assert.deepEqual(planPluginDens([], 'My Plugin'), []);
});

test('planPluginDens validates purpose, defaults den type, and names dens', () => {
    const plans = planPluginDens(
        [
            { purpose: 'support' },
            { purpose: 'tutorial', denType: 'private', name: 'Learn it' },
            { purpose: 'bogus' },
        ],
        'Fancy Stickers',
    );
    assert.equal(plans.length, 2);
    assert.deepEqual(plans[0], {
        purpose: 'support',
        denType: 'public',
        name: 'Fancy Stickers — Support',
        classification: { denType: 'public' },
        classificationStateEventType: DEN_CLASSIFICATION_STATE_EVENT_TYPE,
    });
    assert.equal(plans[1].purpose, 'tutorial');
    assert.equal(plans[1].denType, 'private');
    assert.equal(plans[1].name, 'Learn it');
});

test('planPluginDens collapses duplicate purposes to the first', () => {
    const plans = planPluginDens(
        [
            { purpose: 'support', name: 'First' },
            { purpose: 'support', name: 'Second' },
        ],
        'Plug',
    );
    assert.equal(plans.length, 1);
    assert.equal(plans[0].name, 'First');
});

test('planPluginDens falls back to a default name when none is given', () => {
    const plans = planPluginDens([{ purpose: 'update' }], '');
    assert.equal(plans[0].name, 'Plugin — Updates');
});
