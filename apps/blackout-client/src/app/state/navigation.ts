import { atom } from 'jotai';

export type RightPanelType =
    | 'members'
    | 'threads'
    | 'pins'
    | 'search'
    | 'governance'
    | 'monetization'
    | 'roles'
    | 'townhall_sfu'
    | 'widget_shell_layouts'
    | 'media_pipeline'
    | 'media_spoilers'
    | 'media_codeblocks'
    | 'media_link_previews'
    | 'element_call'
    | 'matrix_widget_compat'
    | 'soundboard'
    | 'numbers_station'
    | 'stage_channels'
    | null;

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

/**
 * Optional event to focus when opening a room timeline.
 */
export const roomJumpTargetEventIdAtom = atom<string | null>(null);

/**
 * Optional unread marker event for the selected room timeline.
 */
export const roomUnreadMarkerEventIdAtom = atom<string | null>(null);

/**
 * Five canonical AppShell modes. The active mode is derived from the route,
 * not held in state — components that need to react to mode read this atom
 * which is updated by the AppShell on route change.
 */
export type ShellMode =
    | 'discovery'
    | 'community'
    | 'livestream'
    | 'marketplace'
    | 'creator'
    | 'inbox'
    | 'events'
    | 'other';

/**
 * Discriminated descriptor for the AppShell's right-panel slot. Each mode
 * owns its descriptor variant; AppShell switch-renders by `kind`.
 */
export type RightPanelDescriptor =
    | { kind: 'none' }
    | { kind: 'community-info'; canopyId: string | null; denId: string | null }
    | { kind: 'product-detail'; listingId: string }
    | { kind: 'livestream-chat'; streamId: string }
    | { kind: 'creator-profile'; userId: string }
    | { kind: 'dm-thread'; roomId: string }
    | { kind: 'event-rsvp'; eventId: string }
    | { kind: 'legacy-room'; rightPanel: RightPanelType };

export const shellModeAtom = atom<ShellMode>('other');

export const rightPanelDescriptorAtom = atom<RightPanelDescriptor>({ kind: 'none' });
