import { atomWithStorage } from 'jotai/utils';

/**
 * Tabs on the canopies hub (`/canopies`). Unlike Coliseum's ids these are not
 * gated per-room by a Matrix state event — the hub is always standalone — so
 * the taxonomy lives here in the client rather than in `@blackout/core`.
 */
export const CANOPY_HUB_TABS = ['yours', 'discover', 'friends', 'create'] as const;
export type CanopyHubTabId = typeof CANOPY_HUB_TABS[number];

export const DEFAULT_CANOPY_HUB_TAB: CanopyHubTabId = 'yours';

export const canopyHubTabAtom = atomWithStorage<CanopyHubTabId>(
    'bmc-canopy-tab',
    DEFAULT_CANOPY_HUB_TAB
);

export const CANOPY_HUB_TAB_LABELS: Record<CanopyHubTabId, string> = {
    yours: 'Yours',
    discover: 'Discover',
    friends: 'Friends',
    create: 'Create',
};

/**
 * Short plain-text hints per tab, rendered as button tooltips in the tab strip.
 * Fuller explainers live in `canopyTabGuides.tsx`; keep the two in sync when a
 * tab's purpose changes.
 */
export const CANOPY_HUB_TAB_HINTS: Record<CanopyHubTabId, string> = {
    yours: 'The canopies you have joined',
    discover: 'Find new canopies and dens to join',
    friends: 'Your friends, requests, and pending invites',
    create: 'Start a new canopy or import one from Discord',
};

export const CANOPY_HUB_TAB_ORDER: CanopyHubTabId[] = [...CANOPY_HUB_TABS];

export function isValidCanopyHubTab(value: string): value is CanopyHubTabId {
    return (CANOPY_HUB_TABS as readonly string[]).includes(value);
}
