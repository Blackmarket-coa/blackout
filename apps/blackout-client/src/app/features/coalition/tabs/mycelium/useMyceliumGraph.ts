import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    sharedMembershipWeight,
    type MyceliumEdge,
    type MyceliumGraph,
} from '../../../../../lib/bmc-core';
import { joinedRoomsAtom } from '../../../../state/rooms';
import { isSpace } from '../../../../utils/room';

/**
 * Derive a MyceliumGraph from the user's joined Spaces (canopies).
 *
 * Nodes are joined Spaces; their membership counts come from
 * `Room.getJoinedMemberCount()`. Edges run between canopies that share
 * at least one member — the hyphal weight is the size of that
 * intersection. v1 keeps the edge derivation simple; richer signals
 * (recent reactions, credit transfers) follow once those feeds are
 * wired through. Membership reads are synchronous on the Matrix room
 * objects, so no extra round-trips.
 */
export function useMyceliumGraph(): MyceliumGraph {
    const rooms = useAtomValue(joinedRoomsAtom);

    return useMemo(() => {
        const canopies: Room[] = rooms.filter((room) => isSpace(room));

        const memberSets = new Map<string, Set<string>>();
        for (const canopy of canopies) {
            const members = (canopy.getJoinedMembers?.() ?? []).map((m) => m.userId);
            memberSets.set(canopy.roomId, new Set(members));
        }

        const nodes = canopies.map((canopy) => ({
            id: canopy.roomId,
            label: canopy.name ?? canopy.roomId,
            memberCount: canopy.getJoinedMemberCount?.() ?? 0,
        }));

        const edges: MyceliumEdge[] = [];
        for (let i = 0; i < canopies.length; i += 1) {
            for (let j = i + 1; j < canopies.length; j += 1) {
                const a = canopies[i].roomId;
                const b = canopies[j].roomId;
                const setA = memberSets.get(a);
                const setB = memberSets.get(b);
                if (!setA || !setB) continue;
                const weight = sharedMembershipWeight(setA, setB);
                if (weight > 0) {
                    edges.push({ a, b, weight });
                }
            }
        }

        return { nodes, edges };
    }, [rooms]);
}
