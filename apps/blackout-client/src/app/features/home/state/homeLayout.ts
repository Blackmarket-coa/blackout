import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { DEFAULT_HOME_WIDGET_ORDER, HOME_WIDGET_IDS, type HomeWidgetId } from '../homeWidgets';

/**
 * Per-user Town Square (home) dashboard layout. `order` is every widget
 * currently placed on the board — visible or hidden — in display order;
 * `hidden` is the subset toggled off (kept in `order` so re-showing restores
 * its position). Premium/optional widgets are absent until the user adds them
 * from the widget gallery; removing a widget drops it from `order` entirely.
 *
 * Persisted locally (versioned key) so the layout survives reloads and syncs
 * across tabs. Reconciled against the live widget registry on every read so a
 * shipped/removed widget never white-screens `/`.
 */
export interface HomeLayoutState {
    version: 1;
    order: HomeWidgetId[];
    hidden: HomeWidgetId[];
}

export const HOME_LAYOUT_STORAGE_KEY = 'blackout.home.layout.v1';

export const DEFAULT_HOME_LAYOUT: HomeLayoutState = {
    version: 1,
    order: [...DEFAULT_HOME_WIDGET_ORDER],
    hidden: [],
};

const KNOWN_IDS = new Set<HomeWidgetId>(HOME_WIDGET_IDS);

/**
 * Reconcile a stored (possibly stale) layout against the current registry:
 * drop unknown ids, keep the user's ordering, append any default widget that
 * isn't placed yet (so a newly-shipped default widget appears), and clamp
 * `hidden` to ids actually in `order`.
 */
export function reconcileHomeLayout(
    stored: Partial<HomeLayoutState> | null | undefined
): HomeLayoutState {
    const storedOrder = Array.isArray(stored?.order) ? stored!.order : [];
    const seen = new Set<HomeWidgetId>();
    const order: HomeWidgetId[] = [];
    for (const id of storedOrder) {
        if (KNOWN_IDS.has(id as HomeWidgetId) && !seen.has(id as HomeWidgetId)) {
            seen.add(id as HomeWidgetId);
            order.push(id as HomeWidgetId);
        }
    }
    // A freshly-shipped default widget the user has never seen: append it so it
    // shows up rather than staying invisible.
    for (const id of DEFAULT_HOME_WIDGET_ORDER) {
        if (!seen.has(id)) {
            seen.add(id);
            order.push(id);
        }
    }
    const inOrder = new Set(order);
    const hidden = (Array.isArray(stored?.hidden) ? stored!.hidden : []).filter(
        (id): id is HomeWidgetId =>
            KNOWN_IDS.has(id as HomeWidgetId) && inOrder.has(id as HomeWidgetId)
    );
    return { version: 1, order, hidden };
}

const noopStorage: Storage = {
    length: 0,
    clear: () => undefined,
    key: () => null,
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
};

// Reconcile on read so a corrupt or schema-drifted payload can never crash the
// home route — a bad parse falls back to the default layout.
const reconcilingStorage = createJSONStorage<HomeLayoutState>(() => {
    try {
        return window.localStorage;
    } catch {
        return noopStorage;
    }
});

const safeStorage = {
    ...reconcilingStorage,
    getItem: (key: string, initialValue: HomeLayoutState): HomeLayoutState => {
        try {
            const value = reconcilingStorage.getItem(key, initialValue);
            return reconcileHomeLayout(value);
        } catch {
            return DEFAULT_HOME_LAYOUT;
        }
    },
};

export const homeLayoutAtom = atomWithStorage<HomeLayoutState>(
    HOME_LAYOUT_STORAGE_KEY,
    DEFAULT_HOME_LAYOUT,
    safeStorage
);

/** Move a widget one slot up/down within the visible order. Pure helper. */
export function moveWidget(
    state: HomeLayoutState,
    id: HomeWidgetId,
    direction: -1 | 1
): HomeLayoutState {
    const order = [...state.order];
    const from = order.indexOf(id);
    if (from < 0) return state;
    const to = from + direction;
    if (to < 0 || to >= order.length) return state;
    [order[from], order[to]] = [order[to]!, order[from]!];
    return { ...state, order };
}

/** Reorder `id` to sit immediately before `beforeId` (drag-and-drop). */
export function reorderWidget(
    state: HomeLayoutState,
    id: HomeWidgetId,
    beforeId: HomeWidgetId | null
): HomeLayoutState {
    if (id === beforeId) return state;
    const order = state.order.filter((w) => w !== id);
    if (beforeId === null) {
        order.push(id);
    } else {
        const idx = order.indexOf(beforeId);
        if (idx < 0) order.push(id);
        else order.splice(idx, 0, id);
    }
    return { ...state, order };
}

export function setWidgetHidden(
    state: HomeLayoutState,
    id: HomeWidgetId,
    hidden: boolean
): HomeLayoutState {
    const set = new Set(state.hidden);
    if (hidden) set.add(id);
    else set.delete(id);
    return { ...state, hidden: [...set] };
}

/** Add a widget to the board (appended) if not already present. */
export function addWidget(state: HomeLayoutState, id: HomeWidgetId): HomeLayoutState {
    if (state.order.includes(id)) {
        // Already placed — just un-hide it.
        return setWidgetHidden(state, id, false);
    }
    return { ...state, order: [...state.order, id] };
}

/** Remove a widget from the board entirely (returns it to the gallery). */
export function removeWidget(state: HomeLayoutState, id: HomeWidgetId): HomeLayoutState {
    return {
        ...state,
        order: state.order.filter((w) => w !== id),
        hidden: state.hidden.filter((w) => w !== id),
    };
}
