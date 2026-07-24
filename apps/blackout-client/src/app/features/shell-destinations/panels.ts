import { createElement, type ComponentType } from 'react';
import type { ShellPanelEntry } from '../../core/features/types';
import {
    COALITION_PATH,
    COLISEUM_PATH,
    PROFILE_SELF_PATH,
    ROOT_PATH,
    STREAMING_PATH,
} from '../../pages/paths';

/**
 * Emoji glyph as a panel icon component. Rendered inside the bars' fixed
 * 24px icon well, so each destination gets a visual cue alongside its label
 * without pulling in an icon library.
 */
export const glyphIcon = (glyph: string): ComponentType =>
    function GlyphIcon() {
        return createElement('span', { 'aria-hidden': true }, glyph);
    };

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
 *
 * `description` is the destination's one-line identity, surfaced as the
 * tab's tooltip by RegistryTabBar.
 */
export const shellDestinationPanels: ShellPanelEntry[] = [
    {
        id: 'shell.home',
        kind: 'mobile-tab',
        label: 'Town Square',
        description:
            'One feed of everything growing across Blackout — dens, streams, debates, listings, and the people you follow.',
        icon: glyphIcon('🏛️'),
        to: ROOT_PATH,
        order: 10,
    },
    {
        id: 'shell.streams',
        kind: 'mobile-tab',
        label: 'Creator Hub',
        description:
            'Make and manage your content — live streams, replays, clips, kits, earnings, and platform integrations.',
        icon: glyphIcon('🎥'),
        to: STREAMING_PATH,
        order: 20,
    },
    {
        id: 'shell.coalition',
        kind: 'mobile-tab',
        label: 'Coalition',
        description:
            'The mutual-aid map — nearby stories, events, projects, and crews organizing on the ground.',
        icon: glyphIcon('🗺️'),
        to: COALITION_PATH,
        order: 30,
    },
    {
        id: 'shell.coliseum',
        kind: 'mobile-tab',
        label: 'Coliseum',
        description:
            'The arena — structured debates, 1v1 matches, shouts, and challenges. Conflict stays in the arena.',
        icon: glyphIcon('⚔️'),
        to: COLISEUM_PATH,
        order: 40,
    },
    {
        id: 'shell.profile',
        kind: 'mobile-tab',
        label: 'Profile',
        description: 'Your page — wall, top friends, pinned media, badges, themes, and reputation.',
        icon: glyphIcon('👤'),
        to: PROFILE_SELF_PATH,
        order: 50,
    },
];
