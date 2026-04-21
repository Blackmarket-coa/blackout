import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { allRoomsAtom } from '../../state/bmc-rooms';
import { spaceChildrenAtom, spaceHierarchyAtom, type SpaceNode } from '../../state/bmc-spaces';

export interface HookResult<T> {
    data: T;
    loading: boolean;
    error: Error | null;
}

export const useLegacySpaceChildrenAdapter = (spaceId: string): HookResult<string[]> => {
    const children = useAtomValue(spaceChildrenAtom(spaceId));

    return useMemo(() => ({ data: children, loading: false, error: null }), [children]);
};

export const useLegacySpaceTreeAdapter = (): HookResult<SpaceNode[]> => {
    const tree = useAtomValue(spaceHierarchyAtom);
    const rooms = useAtomValue(allRoomsAtom);

    return useMemo(
        () => ({
            data: tree,
            loading: rooms.length === 0,
            error: null,
        }),
        [rooms.length, tree]
    );
};
