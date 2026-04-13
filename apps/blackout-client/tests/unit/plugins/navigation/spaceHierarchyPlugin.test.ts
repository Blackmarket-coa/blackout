import { describe, expect, it } from 'vitest';
import { flattenSpaceHierarchyForNav, navigationSpaceHierarchyPlugin } from '../../../../../src/app/plugins/navigation';
import { isRuntimePluginEnabled } from '../../../../../src/app/plugins/manifest';

describe('navigation space hierarchy plugin', () => {
    it('keeps placement deterministic for nested spaces', () => {
        const ordered = flattenSpaceHierarchyForNav([
            {
                roomId: '!root:example.org',
                children: [
                    { roomId: '!childA:example.org', children: [] },
                    {
                        roomId: '!childB:example.org',
                        children: [{ roomId: '!childB1:example.org', children: [] }],
                    },
                ],
            },
        ]);

        expect(ordered).toEqual([
            '!root:example.org',
            '!childA:example.org',
            '!childB:example.org',
            '!childB1:example.org',
        ]);
    });

    it('has explicit manifest toggle wiring', () => {
        expect(navigationSpaceHierarchyPlugin.isEnabled()).toBe(
            isRuntimePluginEnabled('navigation.space-hierarchy'),
        );
    });
});
