import { describe, expect, it } from 'vitest';
import { runtimePluginManifest } from '../../../../src/app/core/features/manifest';
import { orderedRuntimePlugins } from '../../../../src/app/plugins/manifest';

describe('runtime plugin manifest enforcement', () => {
    it('keeps runtime plugin declarations in canonical allowlist order', () => {
        expect(orderedRuntimePlugins.map((plugin) => plugin.id)).toEqual(runtimePluginManifest);
    });
});
