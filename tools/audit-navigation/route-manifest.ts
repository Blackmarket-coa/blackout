/**
 * Static manifest of every URL the navigation audit visits. Mirrors the
 * canonical constants in `apps/blackout-client/src/app/pages/paths.ts`
 * and the shell roots enumerated in
 * `apps/blackout-client/src/app/pages/shell/modeRouter.ts`. We restate
 * them here rather than importing the source module because that file
 * pulls in `react-router-dom`, which is unnecessary for the crawler and
 * inflates the audit's runtime footprint.
 *
 * Parameterised paths (`/:spaceIdOrAlias/`, `/communities/:canopyId/...`)
 * are filled with sentinel ids so the route round-trips through the
 * router without hitting `<Outlet />`-less 404 fallthrough. Real
 * tenancy is not required — the audit only cares that the AppShell
 * mounts and produces sane chrome.
 */

export type WebRoute = {
    /** Canonical id used in audit findings. */
    id: string;
    /** Concrete pathname to navigate to. */
    path: string;
    /** Shell mode the route is expected to resolve to. */
    mode:
        | 'discovery'
        | 'community'
        | 'livestream'
        | 'marketplace'
        | 'creator'
        | 'streaming'
        | 'coalition'
        | 'coliseum'
        | 'inbox'
        | 'events'
        | 'other';
    /**
     * When true, the route is allowed to live outside the AppShell (login,
     * register, etc.) — the home-button invariant is relaxed and the
     * dead-end check accepts the form's submit button as outbound.
     */
    chromeless?: boolean;
};

const SENTINEL_SPACE = '!sentinel-space:example.org';
const SENTINEL_ROOM = '!sentinel-room:example.org';
const SENTINEL_USER = '@sentinel-user:example.org';

export const WEB_ROUTES: readonly WebRoute[] = [
    // Auth / chromeless shells.
    { id: 'login', path: '/login/', mode: 'other', chromeless: true },
    { id: 'register', path: '/register/', mode: 'other', chromeless: true },
    { id: 'reset-password', path: '/reset-password/', mode: 'other', chromeless: true },

    // Discovery cluster.
    { id: 'root', path: '/', mode: 'discovery' },
    { id: 'home', path: '/home/', mode: 'discovery' },
    { id: 'home-create', path: '/home/create/', mode: 'discovery' },
    { id: 'home-join', path: '/home/join/', mode: 'discovery' },
    { id: 'home-search', path: '/home/search/', mode: 'discovery' },
    { id: 'explore', path: '/explore/', mode: 'discovery' },
    { id: 'explore-featured', path: '/explore/featured/', mode: 'discovery' },
    { id: 'topics', path: '/topics', mode: 'discovery' },
    { id: 'topic-detail', path: '/topics/example-tag', mode: 'discovery' },

    // Inbox / messaging cluster.
    { id: 'messages', path: '/messages/', mode: 'inbox' },
    { id: 'inbox-notifications', path: '/messages/notifications/', mode: 'inbox' },
    { id: 'inbox-invites', path: '/messages/invites/', mode: 'inbox' },
    { id: 'direct-create', path: '/messages/locked-in/create/', mode: 'inbox' },
    { id: 'legacy-direct', path: '/direct/', mode: 'inbox' },
    { id: 'legacy-inbox', path: '/inbox/', mode: 'inbox' },

    // Communities.
    { id: 'communities', path: '/communities', mode: 'community' },
    {
        id: 'communities-canopy',
        path: `/communities/${encodeURIComponent(SENTINEL_SPACE)}`,
        mode: 'community',
    },
    {
        id: 'communities-den',
        path: `/communities/${encodeURIComponent(SENTINEL_SPACE)}/dens/${encodeURIComponent(
            SENTINEL_ROOM
        )}`,
        mode: 'community',
    },

    // Marketplace / live / creator / events.
    { id: 'market', path: '/market', mode: 'marketplace' },
    {
        id: 'market-listing',
        path: '/market/listings/example-listing',
        mode: 'marketplace',
    },
    { id: 'live', path: '/live', mode: 'livestream' },
    { id: 'live-stream', path: '/live/example-stream', mode: 'livestream' },
    // Creator Hub (the `streaming` feature). `/creator-hub` is the rebranded
    // alias that redirects to `/streaming`; visiting it asserts the redirect
    // lands on a live, non-dead-end surface. Both resolve to shell mode
    // `streaming` (see modeRouter.ts).
    { id: 'creator-hub', path: '/streaming', mode: 'streaming' },
    { id: 'creator-hub-alias', path: '/creator-hub', mode: 'streaming' },
    { id: 'creator-dashboard', path: '/creator', mode: 'creator' },
    { id: 'creator-listings', path: '/creator/listings', mode: 'creator' },
    {
        id: 'creator-storefront',
        path: `/creators/${encodeURIComponent(SENTINEL_USER)}`,
        mode: 'other',
    },
    { id: 'events', path: '/events', mode: 'events' },
    {
        id: 'event-detail',
        path: `/events/${encodeURIComponent(SENTINEL_ROOM)}/example-event`,
        mode: 'events',
    },

    // Primary destinations that each own a shell mode/root (see modeRouter.ts).
    { id: 'coalition', path: '/coalition', mode: 'coalition' },
    { id: 'coliseum', path: '/coliseum', mode: 'coliseum' },

    // Onboarding / federation / monetization.
    { id: 'onboarding-creator', path: '/onboarding/creator', mode: 'other' },
    { id: 'federation-self-host', path: '/federation/self-host', mode: 'other' },
    { id: 'monetization', path: '/monetization/', mode: 'other' },
    { id: 'monetization-plans', path: '/monetization/subscriptions/plans/', mode: 'other' },
    { id: 'monetization-boosts', path: '/monetization/boosts/', mode: 'other' },
    { id: 'monetization-quests', path: '/monetization/quests/', mode: 'other' },
    { id: 'monetization-marketplace', path: '/monetization/marketplace/', mode: 'other' },
    {
        id: 'monetization-app-marketplace',
        path: '/monetization/app-marketplace/',
        mode: 'other',
    },
    {
        id: 'monetization-payouts',
        path: '/monetization/payouts/revenue-analytics/',
        mode: 'other',
    },
    { id: 'monetization-theme-packs', path: '/monetization/theme-packs/', mode: 'other' },
    { id: 'monetization-aid-pools', path: '/monetization/aid-pools/', mode: 'other' },
    { id: 'monetization-earnings', path: '/monetization/earnings/', mode: 'other' },
] as const;

/**
 * Shell roots — the canonical top-level destinations the AppShell knows
 * how to render. Lifted from `modeRouter.ts#SHELL_ROOT_PATHS`. Used by
 * `back-navigation.spec.ts` to verify that back navigation from a leaf
 * lands on a root rather than dumping the user into a 404.
 */
export const SHELL_ROOT_PATHS: readonly string[] = [
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
] as const;

/**
 * Registry of modal-state atoms and dialog components the crawler can
 * open via the dev-only `window.__openModal(name)` bridge. The list is
 * what the bridge supports; runtime gating decides whether each modal
 * is actually mountable in the current session.
 */
export const KNOWN_MODALS: readonly string[] = [
    'createSpace',
    'createRoom',
    'search',
    'profile',
    'logout',
    'timeout',
    'createPost',
] as const;
