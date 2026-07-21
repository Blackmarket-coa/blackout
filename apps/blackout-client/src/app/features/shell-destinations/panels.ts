import type { ShellPanelEntry } from '../../core/features/types';
import {
    COALITION_PATH,
    COLISEUM_PATH,
    PROFILE_SELF_PATH,
    ROOT_PATH,
    STREAMING_PATH,
} from '../../pages/paths';

/**
 * Five canonical AppShell destinations, matching the Blackout product spec's
 * primary tabs: Home / Creator Hub / Coalition / Coliseum / Profile. These
 * feed both the desktop top nav (PrimaryNavBar) and the mobile BottomTabBar,
 * so the ordering here is the single source of truth across viewports.
 * The `id` namespace is intentional: the bars filter to exactly these ids
 * so other features that register mobile-tab panels (governance, etc.) stay
 * out of the AppShell bars.
 *
 * Each panel `to` points at an existing top-level route:
 *   - shell.home → `/` (HomeFeed)
 *   - shell.streams → `/streaming` (Creator Hub: live + replay + clips, etc.)
 *   - shell.coalition → `/coalition` (spatial community layer)
 *   - shell.coliseum → `/coliseum` (vertical debate reel)
 *   - shell.profile → `/profile/me` (the viewer's own profile)
 */
export const shellDestinationPanels: ShellPanelEntry[] = [
    {
        id: 'shell.home',
        kind: 'mobile-tab',
        label: 'Town Square',
        to: ROOT_PATH,
        order: 10,
    },
    {
        id: 'shell.streams',
        kind: 'mobile-tab',
        label: 'Creator Hub',
        to: STREAMING_PATH,
        order: 20,
    },
    {
        id: 'shell.coalition',
        kind: 'mobile-tab',
        label: 'Coalition',
        to: COALITION_PATH,
        order: 30,
    },
    {
        id: 'shell.coliseum',
        kind: 'mobile-tab',
        label: 'Coliseum',
        to: COLISEUM_PATH,
        order: 40,
    },
    {
        id: 'shell.profile',
        kind: 'mobile-tab',
        label: 'Profile',
        to: PROFILE_SELF_PATH,
        order: 50,
    },
];
