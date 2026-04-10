import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { allRoomsAtom } from '../state/bmc-rooms';
import { spaceChildrenAtom, spaceHierarchyAtom, type SpaceNode } from '../state/bmc-spaces';

export interface HookResult<T> {
    data: T;
    loading: boolean;
    error: Error | null;
}

/** Returns child room IDs for a space ID. */
export const useSpaceChildren = (spaceId: string): HookResult<string[]> => {
    const children = useAtomValue(spaceChildrenAtom(spaceId));

    return useMemo(() => ({ data: children, loading: false, error: null }), [children]);
};

/** Returns full recursive space hierarchy for sidebar rendering. */
export const useSpaceTree = (): HookResult<SpaceNode[]> => {
    const tree = useAtomValue(spaceHierarchyAtom);
    const rooms = useAtomValue(allRoomsAtom);

    return useMemo(
        () => ({
            data: tree,
            loading: rooms.length === 0,
            error: null,
        }),
        [rooms.length, tree],
    );
};
