import type { ShellMode } from '../../state/navigation';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

/**
 * Derives the active AppShell mode from a pathname. Pure function, no
 * router dependencies, so it round-trips cleanly through tests and through
 * the bottom-tab "active state" computation.
 *
 * The mapping is intentionally permissive about trailing segments: any
 * `/communities/...` path resolves to "community", any `/market/...` to
 * "marketplace", etc. Exact tab matching uses `isShellPathActive` below.
 */
export const resolveShellMode = (pathname: string): ShellMode => {
    if (pathname === '/' || pathname.startsWith('/home')) return 'discovery';
    if (pathname.startsWith('/explore')) return 'discovery';
    if (pathname.startsWith('/topics')) return 'discovery';
    if (pathname.startsWith('/communities')) return 'community';
    if (pathname.startsWith('/live')) return 'livestream';
    if (pathname.startsWith('/market')) return 'marketplace';
    if (pathname.startsWith('/coalition')) return 'coalition';
    if (pathname.startsWith('/coliseum')) return 'coliseum';
    // Creator Hub lives at `/streaming`; the `/creator-hub` alias must be
    // matched before the broader `/creator` prefix so it isn't misread as the
    // creator-dashboard mode.
    if (pathname.startsWith('/streaming') || pathname.startsWith('/creator-hub')) {
        return 'streaming';
    }
    if (pathname.startsWith('/creator')) return 'creator';
    if (
        pathname.startsWith('/messages') ||
        pathname.startsWith('/inbox') ||
        pathname.startsWith('/direct')
    ) {
        return 'inbox';
    }
    if (pathname.startsWith('/events')) return 'events';
    return 'other';
};

/**
 * Returns true when `pathname` belongs to the `to` destination's URL
 * subtree. Exposed so the BottomTabBar can highlight the active tab
 * without knowing about specific destinations.
 */
export const isShellPathActive = (pathname: string, to: string): boolean => {
    if (to === '/') return pathname === '/' || pathname.startsWith('/home');
    const normalized = to.endsWith('/') ? to.slice(0, -1) : to;
    return pathname === normalized || pathname.startsWith(`${normalized}/`);
};

const SHELL_ROOT_PATHS = new Set<string>([
    '/',
    '/home',
    '/explore',
    '/topics',
    '/communities',
    '/live',
    '/market',
    '/creator',
    '/streaming',
    '/coalition',
    '/coliseum',
    '/messages',
    '/inbox',
    '/direct',
    '/events',
]);

/**
 * True when `pathname` is the bare root of a shell mode (e.g. `/` or
 * `/communities`). Used by MobileTopBar to decide whether to auto-show
 * a Back affordance: roots don't need one, leaf views do.
 */
export const isShellModeRoot = (pathname: string): boolean => {
    const normalized = pathname.replace(/\/+$/, '') || '/';
    return SHELL_ROOT_PATHS.has(normalized);
};

/**
 * Title shown in the mode-aware top bar. Kept here so the mapping is the
 * single source of truth across MobileTopBar, AppShell tests, and any
 * future analytics surface that wants a stable mode label.
 */
export const SHELL_MODE_TITLES: Record<ShellMode, string> = {
    discovery: 'Town Square',
    community: BLACKOUT_TERMS.canopy.title,
    livestream: 'Live',
    marketplace: 'The Black Market',
    creator: 'Creator',
    streaming: 'Creator Hub',
    coalition: 'Coalition',
    coliseum: 'Coliseum',
    inbox: 'Inbox',
    events: 'Events',
    other: '',
};
