import { useMemo } from 'react';
import { useSpaceTree as useLegacySpaceTree, type HookResult } from '../../hooks/bmc-useSpaceHierarchy';
import type { SpaceNode } from '../../state/bmc-spaces';
import { isRuntimePluginEnabled } from '../manifest';

export const navigationSpaceHierarchyPlugin = {
    id: 'navigation.space-hierarchy' as const,
    isEnabled: () => isRuntimePluginEnabled('navigation.space-hierarchy'),
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
