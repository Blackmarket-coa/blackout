import { atomWithStorage } from 'jotai/utils';

const MAX_VIEW_ENTRIES = 1000;

/**
 * Per-event view counts for ephemeral drops, kept locally. View-count expiry is
 * enforced per device (there's no server counter), so this is best-effort: it
 * stops *this* device from re-opening an expired drop. Keyed by event id.
 *
 * Entries are capped at MAX_VIEW_ENTRIES to prevent localStorage quota
 * exhaustion. When the cap is hit, the oldest entries are pruned.
 */
export const ephemeralViewsAtom = atomWithStorage<Record<string, number>>(
    'blackout.ephemeral.views.v1',
    {},
    undefined,
    {
        unstable_getOnInit: true,
    } as never
);

/**
 * Write to the ephemeral views atom with automatic pruning.
 * Call this instead of directly calling setViews to ensure the store
 * never exceeds the entry cap.
 */
export function pruneAndSetViews(
    current: Record<string, number>,
    updater: (prev: Record<string, number>) => Record<string, number>
): Record<string, number> {
    const next = updater(current);
    const keys = Object.keys(next);
    if (keys.length <= MAX_VIEW_ENTRIES) return next;

    // Drop oldest entries to stay under the cap
    const sorted = keys.sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0));
    const keep = new Set(sorted.slice(sorted.length - MAX_VIEW_ENTRIES));
    const pruned: Record<string, number> = {};
    for (const key of keys) {
        if (keep.has(key)) pruned[key] = next[key];
    }
    return pruned;
}

/**
 * Remove all view-count entries for events that belong to a specific room.
 * Call this when the user leaves a room to prevent dead entries from consuming
 * localStorage indefinitely.
 */
export function purgeRoomEntries(
    current: Record<string, number>,
    roomId: string
): Record<string, number> {
    const roomPrefix = `$${roomId.replace(/^!/, '')}`;
    const pruned: Record<string, number> = {};
    for (const key of Object.keys(current)) {
        if (!key.includes(roomPrefix)) pruned[key] = current[key];
    }
    return pruned;
}
