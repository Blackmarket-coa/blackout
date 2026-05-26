import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AI_INFERENCE_CAPABILITY,
    aiRuntimeAllowed,
    evaluateAiInstall,
    pluginUsesAi,
} from '@blackout/core';

test('pluginUsesAi detects the ai.inference capability', () => {
    assert.equal(pluginUsesAi(['message.read']), false);
    assert.equal(pluginUsesAi([AI_INFERENCE_CAPABILITY]), true);
});

test('pluginUsesAi detects the ai domain even without the capability', () => {
    assert.equal(pluginUsesAi([], 'ai'), true);
    assert.equal(pluginUsesAi([], 'coliseum'), false);
});

test('evaluateAiInstall passes non-AI plugins at any scope', () => {
    assert.deepEqual(evaluateAiInstall(false, 'user'), { allowed: true, reason: 'ok' });
    assert.deepEqual(evaluateAiInstall(false, 'coalition'), { allowed: true, reason: 'ok' });
});

test('evaluateAiInstall confines AI plugins to den scope', () => {
    for (const scope of ['user', 'coalition', 'creator'] as const) {
        assert.deepEqual(evaluateAiInstall(true, scope), {
            allowed: false,
            reason: 'ai_requires_den_scope',
        });
    }
});

test('evaluateAiInstall requires an AI den when the den type is asserted', () => {
    assert.deepEqual(evaluateAiInstall(true, 'den', 'public'), {
        allowed: false,
        reason: 'ai_requires_ai_den',
    });
    assert.deepEqual(evaluateAiInstall(true, 'den', 'ai'), { allowed: true, reason: 'ok' });
});

test('evaluateAiInstall allows a den-scope AI install when the den type is unknown', () => {
    // The server cannot read Matrix state; the sandbox runtime gate is the boundary.
    assert.deepEqual(evaluateAiInstall(true, 'den'), { allowed: true, reason: 'ok' });
});

test('aiRuntimeAllowed fails closed and only opens for AI dens', () => {
    assert.equal(aiRuntimeAllowed(undefined), false);
    assert.equal(aiRuntimeAllowed('public'), false);
    assert.equal(aiRuntimeAllowed('coalition'), false);
    assert.equal(aiRuntimeAllowed('private'), false);
    assert.equal(aiRuntimeAllowed('ai'), true);
});
