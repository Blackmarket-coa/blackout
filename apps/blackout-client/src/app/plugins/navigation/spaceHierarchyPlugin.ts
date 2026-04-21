import { useMemo } from 'react';
import {
    useLegacySpaceTreeAdapter as useLegacySpaceTree,
    type HookResult,
} from './useLegacySpaceHierarchyAdapter';
import type { SpaceNode } from '../../state/bmc-spaces';
import type { PluginDefinition } from '../contracts';
import { isRuntimePluginEnabled } from '../manifest';

let unregisterLifecycle = (): void => {};

export const navigationSpaceHierarchyPlugin: PluginDefinition<'navigation.space-hierarchy'> = {
    id: 'navigation.space-hierarchy',
    isEnabled: () => isRuntimePluginEnabled('navigation.space-hierarchy'),
    register: () => {
        unregisterLifecycle = (): void => {};
        return unregisterLifecycle;
    },
    unregister: () => {
        unregisterLifecycle();
    },
};

export const flattenSpaceHierarchyForNav = (spaces: SpaceNode[]): string[] => {
    const orderedIds: string[] = [];

    const walk = (nodes: SpaceNode[]) => {
        nodes.forEach((node) => {
            orderedIds.push(node.roomId);
            walk(node.children);
        });
    };

    walk(spaces);
    return orderedIds;
};

export const useNavigationSpaceTree = (): HookResult<SpaceNode[]> => {
    const legacyTree = useLegacySpaceTree();

    return useMemo(() => {
        if (!navigationSpaceHierarchyPlugin.isEnabled()) {
            return { data: [], loading: false, error: null };
        }

        return legacyTree;
    }, [legacyTree]);
};
