import type { ShellPanelEntry } from '../../core/features/types';
import {
    COALITION_PATH,
    COLISEUM_PATH,
    PROFILE_SELF_PATH,
    ROOT_PATH,
    STREAMING_PATH,
} from '../../pages/paths';

/**
 * Five canonical AppShell mobile destinations, matching the Blackout product
 * spec's primary mobile tabs: Home / Coalition / Coliseum / Creator Hub / Profile.
 * The `id` namespace is intentional: BottomTabBar filters to exactly these ids
 * so other features that register mobile-tab panels (governance, etc.) stay out
 * of the AppShell tab bar.
 *
 * Each panel `to` points at an existing top-level route:
 *   - shell.home → `/` (HomeFeed)
 *   - shell.coalition → `/coalition` (spatial community layer)
 *   - shell.coliseum → `/coliseum` (vertical debate reel)
 *   - shell.streams → `/streaming` (Creator Hub: live + replay + clips, etc.)
 *   - shell.profile → `/profile/me` (the viewer's own profile)
 */
export const shellDestinationPanels: ShellPanelEntry[] = [
    {
        id: 'shell.home',
        kind: 'mobile-tab',
        label: 'Home',
        to: ROOT_PATH,
        order: 10,
    },
    {
        id: 'shell.coalition',
        kind: 'mobile-tab',
        label: 'Coalition',
        to: COALITION_PATH,
        order: 20,
    },
    {
        id: 'shell.coliseum',
        kind: 'mobile-tab',
        label: 'Coliseum',
        to: COLISEUM_PATH,
        order: 30,
    },
    {
        id: 'shell.streams',
        kind: 'mobile-tab',
        label: 'Creator Hub',
        to: STREAMING_PATH,
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
