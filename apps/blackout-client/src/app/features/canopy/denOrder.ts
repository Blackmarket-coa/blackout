import type { MatrixClient } from 'matrix-js-sdk';
import { ASCIILexicalTable, orderKeys } from '../../utils/ASCIILexicalTable';

/**
 * Drag-to-reorder support for canopy dens. Pure order-key math (so it is
 * unit-testable in isolation) plus a thin Matrix writer, mirroring the Lobby's
 * reorder logic (`features/lobby/Lobby.tsx`) but decoupled from its
 * `HierarchyItem` model. Order lives on each den's `m.space.child` edge in its
 * parent space; reordering rewrites only the edges whose `order` changed.
 */

export const SPACE_CHILD_STATE_EVENT_TYPE = 'm.space.child';

export interface BucketDen {
    roomId: string;
    /** Current `order` from the parent's `m.space.child` content, if any. */
    order?: string;
}

export interface DenOrderChange {
    roomId: string;
    order: string;
}

// Same lexical space the Lobby uses, so generated keys interleave cleanly with
// any orders written by the legacy reorder UI.
const lex = new ASCIILexicalTable(' '.charCodeAt(0), '~'.charCodeAt(0), 6);

const validOrder = (order: string | undefined): string | undefined =>
    typeof order === 'string' && lex.has(order) ? order : undefined;

/**
 * Move the den at `fromIndex` to `toIndex` within a single kind bucket (the
 * text or voice list of one category) and return only the dens whose `order`
 * must change to realize the new sequence. `toIndex` is the target position in
 * the list with the dragged den removed. Returns `[]` for a no-op move.
 */
export const computeBucketReorder = (
    bucket: BucketDen[],
    fromIndex: number,
    toIndex: number
): DenOrderChange[] => {
    if (fromIndex < 0 || fromIndex >= bucket.length || toIndex < 0 || toIndex > bucket.length - 1) {
        return [];
    }

    const moved = bucket[fromIndex];
    const without = bucket.filter((_, index) => index !== fromIndex);
    const clampedTo = Math.min(Math.max(toIndex, 0), without.length);
    const reordered = [...without.slice(0, clampedTo), moved, ...without.slice(clampedTo)];

    // No-op: the sequence is unchanged.
    if (reordered.every((den, index) => den.roomId === bucket[index].roomId)) {
        return [];
    }

    // The moved den's slot is a gap (undefined) so `orderKeys` mints a key
    // between its new neighbours; every other den keeps its existing key.
    const currentOrders = reordered.map((den) =>
        den.roomId === moved.roomId ? undefined : validOrder(den.order)
    );

    const newOrders = orderKeys(lex, currentOrders);
    if (!newOrders) return [];

    const changes: DenOrderChange[] = [];
    reordered.forEach((den, index) => {
        if (newOrders[index] !== validOrder(den.order)) {
            changes.push({ roomId: den.roomId, order: newOrders[index] });
        }
    });
    return changes;
};

/**
 * Write the reordered `m.space.child` edges on the parent space, spreading each
 * den's existing edge content so `via`/`suggested` survive (matching the Lobby
 * write pattern). `contentByDenId` carries the current edge content per den.
 */
export const reorderDenInCanopy = async (
    mx: MatrixClient,
    {
        parentId,
        changes,
        contentByDenId,
    }: {
        parentId: string;
        changes: DenOrderChange[];
        contentByDenId: Record<string, Record<string, unknown>>;
    }
): Promise<void> => {
    for (const { roomId, order } of changes) {
        const existing = contentByDenId[roomId] ?? {};
        // eslint-disable-next-line no-await-in-loop
        await mx.sendStateEvent(
            parentId,
            SPACE_CHILD_STATE_EVENT_TYPE as any,
            { ...existing, order },
            roomId
        );
    }
};
