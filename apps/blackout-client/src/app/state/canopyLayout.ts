import { atom, useSetAtom } from 'jotai';
import { ClientEvent, type MatrixClient, type MatrixEvent, type Room } from 'matrix-js-sdk';
import { useEffect } from 'react';

/**
 * Account-data event carrying the user's canopy rail layout: the order of
 * canopies and any folders grouping them (`docs/archive/blackout_UI_plan.md`'s
 * "drag-and-drop reorder, persisted to Matrix account data"). Account data
 * syncs across the user's devices, so the rail looks the same everywhere.
 */
export const CANOPY_RAIL_LAYOUT_EVENT_TYPE = 'co.bmc.canopy_rail_layout';

export type CanopyLayoutFolder = {
    type: 'folder';
    /** Stable identifier for the folder, unique within the layout. */
    id: string;
    name?: string;
    collapsed?: boolean;
    canopyIds: string[];
};

export type CanopyLayoutItem = { type: 'canopy'; canopyId: string } | CanopyLayoutFolder;

export type CanopyRailLayout = { version: 1; items: CanopyLayoutItem[] };

export const EMPTY_CANOPY_RAIL_LAYOUT: CanopyRailLayout = Object.freeze({
    version: 1,
    items: [],
});

/** A rail row after resolving the layout against the joined canopies. */
export type RailEntry =
    | { kind: 'canopy'; room: Room }
    | { kind: 'folder'; folder: CanopyLayoutFolder; rooms: Room[] };

/** The key a layout item is addressed by in moves: canopyId or folder id. */
export const itemKey = (item: CanopyLayoutItem): string =>
    item.type === 'canopy' ? item.canopyId : item.id;

export const newFolderId = (): string =>
    `f_${
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    }`;

/**
 * Defensive parse of account-data content authored by any of the user's
 * clients. Malformed entries are dropped rather than crashing the rail.
 */
export const parseCanopyRailLayout = (content: unknown): CanopyRailLayout => {
    if (!content || typeof content !== 'object') return EMPTY_CANOPY_RAIL_LAYOUT;
    const raw = content as { version?: unknown; items?: unknown };
    if (raw.version !== 1 || !Array.isArray(raw.items)) return EMPTY_CANOPY_RAIL_LAYOUT;
    const items: CanopyLayoutItem[] = [];
    raw.items.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const item = entry as Record<string, unknown>;
        if (item.type === 'canopy' && typeof item.canopyId === 'string') {
            items.push({ type: 'canopy', canopyId: item.canopyId });
            return;
        }
        if (
            item.type === 'folder' &&
            typeof item.id === 'string' &&
            Array.isArray(item.canopyIds)
        ) {
            items.push({
                type: 'folder',
                id: item.id,
                name: typeof item.name === 'string' ? item.name : undefined,
                collapsed: item.collapsed === true,
                canopyIds: item.canopyIds.filter((id): id is string => typeof id === 'string'),
            });
        }
    });
    return { version: 1, items };
};

/**
 * Dissolves folders that no longer group anything: an empty folder is
 * dropped, a single-member folder is inlined at its position (mirroring
 * Discord, where dragging the second-to-last canopy out dissolves the
 * folder).
 */
export const pruneFolders = (layout: CanopyRailLayout): CanopyRailLayout => {
    const items: CanopyLayoutItem[] = [];
    layout.items.forEach((item) => {
        if (item.type === 'canopy') {
            items.push(item);
            return;
        }
        if (item.canopyIds.length === 0) return;
        if (item.canopyIds.length === 1) {
            items.push({ type: 'canopy', canopyId: item.canopyIds[0] });
            return;
        }
        items.push(item);
    });
    return { version: 1, items };
};

/**
 * Resolves the stored layout against the actually-joined canopies: unknown
 * or duplicate references are dropped, degenerate folders dissolve, and any
 * joined canopy the layout doesn't mention is appended in join order — the
 * layout is advisory, never a gate on what the rail shows.
 */
export const normalizeLayout = (
    layout: CanopyRailLayout,
    joinedCanopyIds: readonly string[]
): CanopyRailLayout => {
    const joined = new Set(joinedCanopyIds);
    const seen = new Set<string>();
    const items: CanopyLayoutItem[] = [];
    layout.items.forEach((item) => {
        if (item.type === 'canopy') {
            if (!joined.has(item.canopyId) || seen.has(item.canopyId)) return;
            seen.add(item.canopyId);
            items.push(item);
            return;
        }
        const canopyIds = item.canopyIds.filter((id) => {
            if (!joined.has(id) || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        if (canopyIds.length > 0) items.push({ ...item, canopyIds });
    });
    joinedCanopyIds.forEach((id) => {
        if (seen.has(id)) return;
        seen.add(id);
        items.push({ type: 'canopy', canopyId: id });
    });
    return pruneFolders({ version: 1, items });
};

/** Resolves layout items into renderable rail rows. */
export const railEntries = (canopies: readonly Room[], layout: CanopyRailLayout): RailEntry[] => {
    const byId = new Map(canopies.map((room) => [room.roomId, room]));
    const normalized = normalizeLayout(
        layout,
        canopies.map((room) => room.roomId)
    );
    return normalized.items.map((item) => {
        if (item.type === 'canopy') {
            return { kind: 'canopy', room: byId.get(item.canopyId) as Room };
        }
        return {
            kind: 'folder',
            folder: item,
            rooms: item.canopyIds.map((id) => byId.get(id) as Room),
        };
    });
};

/** Flat canopy ordering (folders expanded in place) for list surfaces. */
export const orderCanopiesByLayout = (
    canopies: readonly Room[],
    layout: CanopyRailLayout
): Room[] =>
    railEntries(canopies, layout).flatMap((entry) =>
        entry.kind === 'canopy' ? [entry.room] : entry.rooms
    );

const removeCanopyEverywhere = (layout: CanopyRailLayout, canopyId: string): CanopyRailLayout => ({
    version: 1,
    items: layout.items
        .filter((item) => !(item.type === 'canopy' && item.canopyId === canopyId))
        .map((item) =>
            item.type === 'folder'
                ? { ...item, canopyIds: item.canopyIds.filter((id) => id !== canopyId) }
                : item
        ),
});

export type MoveTarget = {
    /** Top-level item key (canopyId or folder id) the drop landed on. */
    key: string;
    position: 'before' | 'after';
    /** Set when the drop landed on a canopy row inside this folder. */
    folderId?: string;
};

/**
 * Moves a top-level item or a folder member to a new position. Sources are
 * addressed by key; canopy sources may come from inside a folder. Folder
 * sources only move at the top level (no folder nesting).
 */
export const moveEntry = (
    layout: CanopyRailLayout,
    sourceKey: string,
    target: MoveTarget
): CanopyRailLayout => {
    if (sourceKey === target.key) return layout;
    const sourceItem = layout.items.find((item) => itemKey(item) === sourceKey);
    const sourceIsFolder = sourceItem?.type === 'folder';

    if (target.folderId) {
        // Dropping between rows inside a folder: canopies only.
        if (sourceIsFolder) return layout;
        const cleared = removeCanopyEverywhere(layout, sourceKey);
        return pruneFolders({
            version: 1,
            items: cleared.items.map((item) => {
                if (item.type !== 'folder' || item.id !== target.folderId) return item;
                const at = item.canopyIds.indexOf(target.key);
                if (at === -1) return { ...item, canopyIds: [...item.canopyIds, sourceKey] };
                const canopyIds = [...item.canopyIds];
                canopyIds.splice(at + (target.position === 'after' ? 1 : 0), 0, sourceKey);
                return { ...item, canopyIds };
            }),
        });
    }

    const moved: CanopyLayoutItem = sourceIsFolder
        ? (sourceItem as CanopyLayoutFolder)
        : { type: 'canopy', canopyId: sourceKey };
    const cleared: CanopyRailLayout = sourceIsFolder
        ? { version: 1, items: layout.items.filter((item) => itemKey(item) !== sourceKey) }
        : removeCanopyEverywhere(layout, sourceKey);

    const items = [...cleared.items];
    const at = items.findIndex((item) => itemKey(item) === target.key);
    if (at === -1) {
        items.push(moved);
    } else {
        items.splice(at + (target.position === 'after' ? 1 : 0), 0, moved);
    }
    return pruneFolders({ version: 1, items });
};

/**
 * Drops a canopy onto another tile's center. Onto a canopy: both become a
 * new folder at the target's position. Onto a folder: the canopy joins it.
 * Folder sources don't combine (no nesting/merging).
 */
export const combineIntoFolder = (
    layout: CanopyRailLayout,
    sourceCanopyId: string,
    targetKey: string,
    folderId: string = newFolderId()
): CanopyRailLayout => {
    if (sourceCanopyId === targetKey) return layout;
    const source = layout.items.find(
        (item) => item.type === 'canopy' && item.canopyId === sourceCanopyId
    );
    const sourceInFolder = layout.items.some(
        (item) => item.type === 'folder' && item.canopyIds.includes(sourceCanopyId)
    );
    if (!source && !sourceInFolder) return layout;

    const target = layout.items.find((item) => itemKey(item) === targetKey);
    if (!target) return layout;
    if (target.type === 'canopy' && target.canopyId === sourceCanopyId) return layout;

    const cleared = removeCanopyEverywhere(layout, sourceCanopyId);
    return pruneFolders({
        version: 1,
        items: cleared.items.map((item) => {
            if (itemKey(item) !== targetKey) return item;
            if (item.type === 'folder') {
                return item.canopyIds.includes(sourceCanopyId)
                    ? item
                    : { ...item, canopyIds: [...item.canopyIds, sourceCanopyId] };
            }
            return {
                type: 'folder',
                id: folderId,
                collapsed: false,
                canopyIds: [item.canopyId, sourceCanopyId],
            } satisfies CanopyLayoutFolder;
        }),
    });
};

export const toggleFolderCollapsed = (
    layout: CanopyRailLayout,
    folderId: string
): CanopyRailLayout => ({
    version: 1,
    items: layout.items.map((item) =>
        item.type === 'folder' && item.id === folderId
            ? { ...item, collapsed: !item.collapsed }
            : item
    ),
});

/**
 * Keyboard reorder (Alt+Arrow): moves a top-level item one slot, or a
 * canopy one slot within its folder.
 */
export const moveByOffset = (
    layout: CanopyRailLayout,
    key: string,
    offset: -1 | 1,
    withinFolderId?: string
): CanopyRailLayout => {
    if (withinFolderId) {
        return {
            version: 1,
            items: layout.items.map((item) => {
                if (item.type !== 'folder' || item.id !== withinFolderId) return item;
                const from = item.canopyIds.indexOf(key);
                const to = from + offset;
                if (from === -1 || to < 0 || to >= item.canopyIds.length) return item;
                const canopyIds = [...item.canopyIds];
                canopyIds.splice(to, 0, ...canopyIds.splice(from, 1));
                return { ...item, canopyIds };
            }),
        };
    }
    const from = layout.items.findIndex((item) => itemKey(item) === key);
    const to = from + offset;
    if (from === -1 || to < 0 || to >= layout.items.length) return layout;
    const items = [...layout.items];
    items.splice(to, 0, ...items.splice(from, 1));
    return { version: 1, items };
};

const baseCanopyRailLayoutAtom = atom<CanopyRailLayout>(EMPTY_CANOPY_RAIL_LAYOUT);

/**
 * The user's persisted rail layout. Written optimistically by rail
 * interactions (`saveCanopyRailLayout` echoes the change into account data)
 * and refreshed from sync by `useBindCanopyRailLayoutAtom`.
 */
export const canopyRailLayoutAtom = atom<CanopyRailLayout, [CanopyRailLayout], undefined>(
    (get) => get(baseCanopyRailLayoutAtom),
    (get, set, layout) => {
        set(baseCanopyRailLayoutAtom, layout);
    }
);

/**
 * Persists the layout to account data. Fire-and-forget by design: the atom
 * is already updated optimistically, and the account-data echo from sync
 * re-confirms it. Absence of a client (tests, logged-out shells) is a no-op.
 */
export const saveCanopyRailLayout = (mx: MatrixClient | null, layout: CanopyRailLayout): void => {
    if (!mx) return;
    void mx
        .setAccountData(CANOPY_RAIL_LAYOUT_EVENT_TYPE as never, layout as never)
        .catch(() => undefined);
};

/**
 * Seeds the layout atom from account data and tracks remote updates. Mount
 * once in the authenticated tree (RoomsAtomBinder in main.tsx) so the rail
 * layout is live on every page, not just the chat shell.
 */
export const useBindCanopyRailLayoutAtom = (mx: MatrixClient) => {
    const setLayout = useSetAtom(canopyRailLayoutAtom);

    useEffect(() => {
        const seed = mx.getAccountData(CANOPY_RAIL_LAYOUT_EVENT_TYPE as never);
        if (seed) setLayout(parseCanopyRailLayout(seed.getContent()));

        const onAccountData = (event: MatrixEvent) => {
            if (event.getType() !== CANOPY_RAIL_LAYOUT_EVENT_TYPE) return;
            setLayout(parseCanopyRailLayout(event.getContent()));
        };
        mx.on(ClientEvent.AccountData, onAccountData);
        return () => {
            mx.removeListener(ClientEvent.AccountData, onAccountData);
        };
    }, [mx, setLayout]);
};
