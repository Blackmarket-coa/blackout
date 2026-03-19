import { atom } from 'jotai';

export type RightPanelType = 'members' | 'threads' | 'pins' | 'search' | null;

/**
 * Current room selection for timeline context.
 */
export const selectedRoomIdAtom = atom<string | null>(null);

/**
 * Current space selection for room-list scoping.
 */
export const selectedSpaceIdAtom = atom<string | null>(null);

/**
 * Global sidebar visibility toggle.
 */
export const sidebarVisibleAtom = atom<boolean>(true);

/**
 * Active right-side panel in the room view.
 */
export const rightPanelAtom = atom<RightPanelType>(null);
